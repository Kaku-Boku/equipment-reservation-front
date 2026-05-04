/**
 * 予約アプリケーションのルートコンポーネント
 *
 * 責務:
 * - カレンダー / タイムライン ビューの切替制御
 * - ナビゲーション（月移動・日移動）
 * - 予約モーダルの開閉・モード管理（新規 / 編集 / 閲覧）
 * - 予約 CRUD の API 通信
 * - app_settings を各コンポーネントに配布
 *
 * データフロー:
 * 1. SSR で取得した初期データを useReservations フックに渡す
 * 2. フックが Realtime で差分同期 & ナビ時に追加取得
 * 3. useMemo で月/日単位にフィルタし、子コンポーネントへ配信
 */
import { useState, useMemo, useEffect } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';
import CalendarView from './CalendarView';
import TimelineView from './TimelineView';
import ReservationModal from './ReservationModal';
import { useReservations } from '../../hooks/useReservations';
import { useReservationMutations } from '../../hooks/useReservationMutations';
import { useRealtimeSync } from '../../hooks/useRealtimeSync';
import { formatDateJa, toDateStr } from '../../utils/date-utils';
import type { AppSettings, Member, Facility } from '../../lib/types';

interface Props {
  initialFacilities: Facility[];
  initialMembers: Member[];
  currentMember: Member;
  initialReservations: any[];
  initialLoadedRange: { start: string; end: string };
  supabaseUrl: string;
  supabaseKey: string;
  accessToken: string;
  appSettings: AppSettings;
}


interface ModalState {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  initialData: any;
}

export default function ReservationApp({
  initialFacilities,
  initialMembers,
  currentMember,
  initialReservations,
  initialLoadedRange,
  supabaseUrl,
  supabaseKey,
  accessToken,
  appSettings,
}: Props) {

  const isAdmin = currentMember?.role === 'admin';

  // ── 予約可能最大日（admin は制限なし） ──
  const maxFutureDate = useMemo(() => {
    if (isAdmin) return undefined;
    const d = new Date();
    d.setDate(d.getDate() + appSettings.reservation_lead_time_days);
    return d;
  }, [isAdmin, appSettings.reservation_lead_time_days]);

  // ── 予約可能過去最大日（2ヶ月前、adminは制限なし） ──
  const maxPastDate = useMemo(() => {
    if (isAdmin) return undefined;
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [isAdmin]);

  const [currentView, setCurrentView] = useState<'calendar' | 'timeline'>('calendar');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [timelineDate, setTimelineDate] = useState('');

  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    mode: 'create',
    initialData: null,
  });

  const [facilities, setFacilities] = useState<Facility[]>(initialFacilities);
  const [members, setMembers] = useState<Member[]>(initialMembers);

  // ── Realtime 購読 (facilities & members) ──
  useRealtimeSync(supabaseUrl, supabaseKey, accessToken, setFacilities, setMembers as any);


  const { reservations, fetchMoreIfNeeded, isFetchingMore } = useReservations(
    initialReservations,
    initialLoadedRange,
    supabaseUrl,
    supabaseKey,
    accessToken,
    maxFutureDate
  );

  const { saveReservation, deleteReservation, updateReservationStatus } = useReservationMutations();

  // ── 表示データのフィルタリング ──
  const monthReservations = useMemo(() => {
    const ym = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}`;
    return reservations.filter(r => r.start_time.startsWith(ym));
  }, [reservations, calendarDate]);

  const dayReservations = useMemo(() => {
    if (!timelineDate) return [];
    return reservations.filter(r => r.start_time.startsWith(timelineDate));
  }, [reservations, timelineDate]);

  // active な設備のみをモーダル選択肢に（メンテナンス中は予約作成不可）
  const activeFacilities = useMemo(
    () => facilities.filter((f: Facility) => f.status === 'active'),
    [facilities]
  );

  // ── ナビゲーション ──
  const handlePrevMonth = () => {
    const prev = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
    if (maxPastDate && new Date(prev.getFullYear(), prev.getMonth() + 1, 0) < maxPastDate) return;
    setCalendarDate(prev);
    fetchMoreIfNeeded(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
    // 管理者以外: maxFutureDate を超えた月には移動しない
    if (maxFutureDate && next > maxFutureDate) return;
    setCalendarDate(next);
    fetchMoreIfNeeded(next);
  };

  const handleToday = () => {
    const today = new Date();
    setCalendarDate(today);
    fetchMoreIfNeeded(today);
  };

  const switchToTimeline = (dateStr: string) => {
    setTimelineDate(dateStr);
    setCurrentView('timeline');
  };

  const switchToCalendar = () => {
    if (timelineDate) {
      const d = new Date(timelineDate + 'T00:00:00');
      if (!isNaN(d.getTime())) {
        const month = new Date(d.getFullYear(), d.getMonth(), 1);
        setCalendarDate(month);
        fetchMoreIfNeeded(month);
      }
    }
    setCurrentView('calendar');
  };

  const handlePrevDay = () => {
    setTimelineDate(prev => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      if (maxPastDate && d < maxPastDate) return prev;
      fetchMoreIfNeeded(d);
      return toDateStr(d);
    });
  };

  const handleNextDay = () => {
    setTimelineDate(prev => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      // 管理者以外: maxFutureDate を超えた日には移動しない
      if (maxFutureDate && d > maxFutureDate) return prev;
      fetchMoreIfNeeded(d);
      return toDateStr(d);
    });
  };

  // ── 予約操作ハンドラー ──

  /** タイムラインの空きセルクリック → 新規予約モーダルを開く */
  const handleFacilityClick = (facilityId: string, time: string) => {
    const [h, m] = time.split(':').map(Number);
    const totalEndMin = h * 60 + m + 30; // 固定で30分とする
    const endHour = Math.floor(totalEndMin / 60);
    const endMin = totalEndMin % 60;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

    setModalState({
      isOpen: true,
      mode: 'create',
      initialData: {
        facility_id: facilityId,
        date: timelineDate,
        start_time: time,
        end_time: endTime,
      },
    });
  };

  /** 既存予約ブロックをクリック → 編集/閲覧モーダルを開く */
  const handleReservationClick = (reservation: any) => {
    const isOwner = reservation.created_by_member?.id === currentMember?.id;
    const canEdit = isOwner || isAdmin;

    const extractTime = (t: string): string => (t ? t.substring(0, 5) : '');
    const datePart = reservation.start_time.split('T')[0] || timelineDate;

    const participantIds = reservation.reservation_participants
      ?.map((p: any) => p.members?.id)
      .filter(Boolean) || [];

    setModalState({
      isOpen: true,
      mode: canEdit ? 'edit' : 'view',
      initialData: {
        ...reservation,
        date: datePart,
        start_time: extractTime(
          reservation.start_time.includes('T')
            ? reservation.start_time.split('T')[1]
            : reservation.start_time
        ),
        end_time: extractTime(
          reservation.end_time.includes('T')
            ? reservation.end_time.split('T')[1]
            : reservation.end_time
        ),
        facility_id: reservation.facilities?.id || reservation.facility_id,
        participant_ids: participantIds,
        // ロック判定用に元のタイムスタンプを保持
        original_start_time: reservation.start_time,
        original_end_time: reservation.end_time,
      },
    });
  };

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 sm:px-6 relative">

      {isFetchingMore && (
        <div
          className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full shadow-md backdrop-blur-sm"
          style={{
            background: 'var(--theme-card-bg)',
            border: '1px solid var(--theme-card-border)',
          }}
        >
          <div className="animate-spin h-3 w-3 border-2 border-primary-500 border-t-transparent rounded-full" />
          <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
            同期中...
          </span>
        </div>
      )}

      {/* ── ナビゲーションバー ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {currentView === 'calendar' ? (
          <div className="flex items-center gap-2">
            <button onClick={handlePrevMonth} className="nav-btn group" title="前月">
              <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <h2
              className="min-w-[140px] text-center text-lg font-semibold tracking-wide"
              style={{ color: 'var(--theme-text)' }}
            >
              {calendarDate.getFullYear()}年 {calendarDate.getMonth() + 1}月
            </h2>
            <button onClick={handleNextMonth} className="nav-btn group" title="次月">
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
            <button
              onClick={handleToday}
              className="ml-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all"
              style={{
                border: '1px solid oklch(0.55 0.21 250 / 0.3)',
                background: 'oklch(0.55 0.21 250 / 0.08)',
                color: 'var(--color-primary-500)',
              }}
            >
              今日
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 animate-fade-in">
            <button onClick={switchToCalendar} className="mr-2 nav-btn" title="カレンダーに戻る">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button onClick={handlePrevDay} className="nav-btn group" title="前日">
              <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <h2
              className="min-w-[180px] text-center text-lg font-semibold tracking-wide"
              style={{ color: 'var(--theme-text)' }}
            >
              {formatDateJa(timelineDate)}
            </h2>
            <button onClick={handleNextDay} className="nav-btn group" title="翌日">
              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        )}
      </div>

      {/* ── ビューの表示 ── */}
      <div className="mt-2">
        {currentView === 'calendar' ? (
          <CalendarView
            calendarDate={calendarDate}
            onSelectDate={switchToTimeline}
            reservations={monthReservations}
            currentMember={currentMember}
            maxFutureDate={maxFutureDate}
            maxPastDate={maxPastDate}
          />
        ) : (
          <TimelineView
            timelineDate={timelineDate}
            facilities={facilities}

            reservations={dayReservations}
            currentMember={currentMember}
            startHour={appSettings.start_hour}
            endHour={appSettings.end_hour}
            onFacilityClick={handleFacilityClick}
            onReservationClick={handleReservationClick}
          />
        )}
      </div>

      {/* ── 予約モーダル ── */}
      {modalState.isOpen && (
        <ReservationModal
          isOpen={modalState.isOpen}
          mode={modalState.mode}
          initialData={modalState.initialData}
          facilities={activeFacilities}
          members={members as any}
          currentMember={currentMember}
          appSettings={appSettings}
          allReservations={reservations}
          onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
          onSave={saveReservation}
          onDelete={deleteReservation}
          onApprove={(id) => updateReservationStatus(id, 'approved')}
          onReject={(id) => updateReservationStatus(id, 'rejected')}
        />
      )}
    </div>

  );
}