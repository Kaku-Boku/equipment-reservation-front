/**
 * 予約アプリケーションのルートコンポーネント
 *
 * 責務:
 * - カレンダー / タイムライン ビューの切替制御
 * - ナビゲーション（月移動・日移動）
 * - 予約モーダルの開閉・モード管理（新規 / 編集 / 閲覧）
 * - 予約 CRUD の API 通信
 *
 * データフロー:
 * 1. SSR で取得した初期データを useReservations フックに渡す
 * 2. フックが Realtime で差分同期 & ナビ時に追加取得
 * 3. useMemo で月/日単位にフィルタし、子コンポーネントへ配信
 */
import { useState, useMemo } from 'preact/hooks';
import CalendarView from './CalendarView';
import TimelineView from './TimelineView';
import ReservationModal from './ReservationModal';
import { useReservations } from '../hooks/useReservations';

/** SSR から渡されるメンバー情報 */
interface Member {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

/** 設備情報 */
interface Facility {
  id: string;
  name: string;
}

/** コンポーネント Props */
interface Props {
  initialFacilities: Facility[];
  initialMembers: Member[];
  currentMember: Member;
  initialReservations: any[];
  initialLoadedRange: { start: string; end: string };
  supabaseUrl: string;
  supabaseKey: string;
}

/** 予約モーダルの状態 */
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
}: Props) {
  const [currentView, setCurrentView] = useState<'calendar' | 'timeline'>('calendar');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [timelineDate, setTimelineDate] = useState('');

  // ── モーダル状態 ──
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    mode: 'create',
    initialData: null,
  });

  // ── データ管理フック ──
  const { reservations, fetchMoreIfNeeded, isFetchingMore } = useReservations(
    initialReservations,
    initialLoadedRange,
    supabaseUrl,
    supabaseKey
  );

  // ── 表示データのフィルタリング（API通信ゼロ） ──
  const monthReservations = useMemo(() => {
    const ym = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}`;
    return reservations.filter(r => r.start_time.startsWith(ym));
  }, [reservations, calendarDate]);

  const dayReservations = useMemo(() => {
    if (!timelineDate) return [];
    return reservations.filter(r => r.start_time.startsWith(timelineDate));
  }, [reservations, timelineDate]);

  // ── ユーティリティ ──

  /** Date を "YYYY-MM-DD" のローカル日付文字列に変換 */
  const toLocalDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  /** "YYYY-MM-DD" を "2026年4月25日(金)" 形式に変換 */
  const formatDateJa = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})`;
  };

  // ── ナビゲーション ──

  const handlePrevMonth = () => {
    const prev = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
    setCalendarDate(prev);
    fetchMoreIfNeeded(prev);
  };

  const handleNextMonth = () => {
    const next = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
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
      fetchMoreIfNeeded(d);
      return toLocalDate(d);
    });
  };

  const handleNextDay = () => {
    setTimelineDate(prev => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      fetchMoreIfNeeded(d);
      return toLocalDate(d);
    });
  };

  // ── 予約操作ハンドラー ──

  /** タイムラインの空きセルクリック → 新規予約モーダルを開く */
  const handleFacilityClick = (facilityId: string, time: string) => {
    const [h, m] = time.split(':').map(Number);
    const endMin = (m + 30) % 60;
    const endHour = h + Math.floor((m + 30) / 60);
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
    const isAdmin = currentMember?.role === 'admin';
    const canEdit = isOwner || isAdmin;

    // "HH:MM:SS" → "HH:MM" に整形
    const extractTime = (t: string): string => (t ? t.substring(0, 5) : '');
    const datePart = reservation.start_time.split('T')[0] || timelineDate;

    // 参加者IDのリストを抽出
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
      },
    });
  };

  /**
   * 予約データの保存（API通信）
   *
   * モーダルから受け取る date + start_time/end_time (HH:MM) を
   * ISO 8601 タイムスタンプに変換してから送信する。
   */
  const handleSaveReservation = async (data: any) => {
    const method = data.id ? 'PUT' : 'POST';

    // date + time → ISO 8601 に変換
    const payload = {
      ...data,
      start_time: `${data.date}T${data.start_time}:00`,
      end_time: `${data.date}T${data.end_time}:00`,
    };

    // date フィールドは API 側では不要なので除去
    delete payload.date;

    const response = await fetch('/api/reserve', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || '予約の保存に失敗しました。');
    }
  };

  /** 予約データの削除（API通信） */
  const handleDeleteReservation = async (id: string) => {
    const response = await fetch('/api/reserve', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || '予約の削除に失敗しました。');
    }
  };

  return (
    <div className="mx-auto max-w-screen-2xl px-4 py-4 sm:px-6 relative">

      {/* バックグラウンド取得中インジケーター */}
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
          />
        ) : (
          <TimelineView
            timelineDate={timelineDate}
            facilities={initialFacilities}
            reservations={dayReservations}
            currentMember={currentMember}
            onFacilityClick={handleFacilityClick}
            onReservationClick={handleReservationClick}
          />
        )}
      </div>

      {/* ── 予約モーダル ── */}
      <ReservationModal
        isOpen={modalState.isOpen}
        mode={modalState.mode}
        initialData={modalState.initialData}
        facilities={initialFacilities}
        members={initialMembers}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        onSave={handleSaveReservation}
        onDelete={handleDeleteReservation}
      />
    </div>
  );
}