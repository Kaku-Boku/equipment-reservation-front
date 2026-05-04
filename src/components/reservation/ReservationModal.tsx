/**
 * 予約モーダルコンポーネント
 *
 * モード (mode):
 * - create: 新規予約作成
 * - edit:   既存予約の編集（作成者 or 管理者のみ）
 * - view:   閲覧専用（他ユーザーの予約、またはロックされた過去の予約）
 *
 * 制約・バリデーション:
 * - min_reservation_minutes / max_reservation_hours による予約時間の検証
 * - 過去データロック（now > start_time + 1h: 開始時刻変更・削除不可, now > end_time + 1h: 編集不可）
 */
import { useState, useEffect, useMemo } from 'preact/hooks';
import { validateReservationDuration, getReservationColor } from '../../utils/reservation-utils';
import type { AppSettings, Member, Facility } from '../../lib/types';

interface MemberOption extends Member {
  email: string;
}

interface ModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  initialData: any;
  facilities: Facility[];
  members: MemberOption[];
  currentMember: Member;
  appSettings: AppSettings;
  allReservations?: any[];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

interface FormState {
  id: string;
  purpose: string;
  facility_id: string;
  date: string;
  start_time: string;
  end_time: string;
  memo: string;
  notice: string;
  participant_ids: string[];
}

export default function ReservationModal({
  isOpen,
  mode,
  initialData,
  facilities,
  members,
  currentMember,
  appSettings,
  allReservations,
  onClose,
  onSave,
  onDelete,
  onApprove,
  onReject,
}: ModalProps) {
  const [formData, setFormData] = useState<FormState>({
    id: '', purpose: '', facility_id: '', date: '',
    start_time: '', end_time: '', memo: '', notice: '', participant_ids: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [participantSearch, setParticipantSearch] = useState('');
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);

  const isAdmin = currentMember?.role === 'admin';

  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        id: initialData.id || '',
        purpose: initialData.purpose || '',
        facility_id: initialData.facility_id || facilities[0]?.id || '',
        date: initialData.date || '',
        start_time: initialData.start_time || '',
        end_time: initialData.end_time || '',
        memo: initialData.memo || '',
        notice: initialData.notice || '',
        participant_ids: initialData.participant_ids || [],
      });
      setErrorMessage('');
    }
  }, [isOpen, initialData, facilities]);

  // ── 時間ロック判定（管理者は常にフル操作可） ──
  const now = useMemo(() => new Date(), [isOpen]);

  let startTimeLocked = false; // 開始時刻変更・削除が disabled
  let fullyLocked = false;     // 全フィールド read-only

  if (!isAdmin && initialData?.original_start_time) {
    const startDt = new Date(initialData.original_start_time);
    const endDt = initialData.original_end_time ? new Date(initialData.original_end_time) : null;
    if (now > new Date(startDt.getTime() + 60 * 60 * 1000)) {
      startTimeLocked = true;
    }
    if (endDt && now > new Date(endDt.getTime() + 60 * 60 * 1000)) {
      fullyLocked = true;
    }
  }

  const isReadOnly = mode === 'view' || (fullyLocked && !isAdmin);
  const disableStartTime = isReadOnly || (startTimeLocked && !isAdmin);
  const disableDelete = isReadOnly || (startTimeLocked && !isAdmin);
  const isPending = initialData?.status === 'pending';

  // ── 設備状態の判定 ──
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const currentStatus = useMemo(() => {
    if (!formData.facility_id) return null;
    const facility = facilities.find(f => f.id === formData.facility_id);
    if (facility?.status === 'maintenance') return { text: 'メンテナンス中', color: 'var(--color-danger-500)', bg: 'oklch(0.62 0.22 25 / 0.1)' };
    
    if (!allReservations) return null;

    const todayRes = allReservations.filter(r => 
       (r.facility_id === formData.facility_id || r.facilities?.id === formData.facility_id) &&
       r.start_time.startsWith(todayStr) &&
       r.status !== 'rejected'
    ).sort((a, b) => a.start_time.localeCompare(b.start_time));

    if (todayRes.length === 0) return { text: '本日の予約なし', color: 'var(--color-success-500)', bg: 'oklch(0.55 0.21 150 / 0.1)' };

    const extractTime = (iso: string) => iso.includes('T') ? iso.split('T')[1].substring(0, 5) : iso.substring(11, 16);

    const inUse = todayRes.find(r => {
      const s = extractTime(r.start_time);
      const e = extractTime(r.end_time);
      return s <= currentTime && currentTime < e;
    });

    if (inUse) return { text: '使用中', color: 'var(--color-danger-500)', bg: 'oklch(0.62 0.22 25 / 0.1)' };

    const nextRes = todayRes.find(r => currentTime < extractTime(r.start_time));

    if (nextRes) {
      const s = extractTime(nextRes.start_time);
      const diffMin = (parseInt(s.split(':')[0]) * 60 + parseInt(s.split(':')[1])) - (now.getHours() * 60 + now.getMinutes());
      if (diffMin <= 15) return { text: `${diffMin}分後から使用開始`, color: 'var(--color-danger-500)', bg: 'oklch(0.62 0.22 25 / 0.1)' };
      if (diffMin <= 60) return { text: `${diffMin}分後から使用開始`, color: 'oklch(0.55 0.18 60)', bg: 'oklch(0.65 0.18 60 / 0.15)' }; // warning
      return { text: `約${Math.floor(diffMin/60)}時間後から使用開始`, color: 'var(--color-primary-500)', bg: 'oklch(0.55 0.21 250 / 0.1)' };
    }

    return { text: '空き', color: 'oklch(0.45 0.18 145)', bg: 'oklch(0.55 0.18 145 / 0.1)' }; // success
  }, [formData.facility_id, allReservations]);

  // 外側クリックで参加者ドロップダウンを閉じる
  useEffect(() => {
    if (!showParticipantDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.participant-dropdown-container')) {
        setShowParticipantDropdown(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showParticipantDropdown]);

  // ── フォーム送信 ──


  /** フォーム入力値のバリデーション */
  const validate = (): string | null => {
    if (!formData.purpose.trim()) return '目的・用途を入力してください。';
    if (!formData.facility_id) return '設備を選択してください。';
    if (!formData.date) return '日付を選択してください。';
    if (!formData.start_time) return '開始時間を入力してください。';
    if (!formData.end_time) return '終了時間を入力してください。';
    if (formData.start_time >= formData.end_time) return '終了時間は開始時間より後に設定してください。';

    const [sh, sm] = formData.start_time.split(':').map(Number);
    const [eh, em] = formData.end_time.split(':').map(Number);
    const durationMin = (eh * 60 + em) - (sh * 60 + sm);

    return validateReservationDuration(
      durationMin,
      appSettings.min_reservation_minutes,
      appSettings.max_reservation_hours
    );
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrorMessage('');
    const validationError = validate();
    if (validationError) { setErrorMessage(validationError); return; }
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (error: any) {
      setErrorMessage(error?.message || '保存に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('本当にこの予約を削除しますか？')) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await onDelete(formData.id);
      onClose();
    } catch (error: any) {
      setErrorMessage(error?.message || '削除に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await onApprove(formData.id);
      onClose();
    } catch (error: any) {
      setErrorMessage(error?.message || '承認に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('この予約を却下しますか？')) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      await onReject(formData.id);
      onClose();
    } catch (error: any) {
      setErrorMessage(error?.message || '却下に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleParticipant = (memberId: string) => {
    setFormData(prev => {
      const ids = prev.participant_ids.includes(memberId)
        ? prev.participant_ids.filter(id => id !== memberId)
        : [...prev.participant_ids, memberId];
      return { ...prev, participant_ids: ids };
    });
  };

  const updateField = (field: keyof FormState, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTimeBlur = (field: 'start_time' | 'end_time') => {
    let val = formData[field];
    if (/^\d{3,4}$/.test(val)) {
      const hStr = val.length === 3 ? val.slice(0, 1) : val.slice(0, 2);
      const mStr = val.slice(-2);
      let h = parseInt(hStr, 10);
      let m = parseInt(mStr, 10);
      if (h >= 0 && h < 24 && m >= 0 && m < 60) {
        val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      } else {
        val = ''; // 無効な値の場合はクリア
      }
    }

    
    if (/^\d{1,2}:\d{2}$/.test(val)) {
      const parts = val.split(':');
      let h = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10);
      const minUnit = appSettings.min_reservation_minutes || 15;
      if (m % minUnit !== 0) {
        m = Math.ceil(m / minUnit) * minUnit;
        if (m >= 60) {
          m -= 60;
          h = (h + 1) % 24;
        }
      }
      val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    if (val !== formData[field]) {
      updateField(field, val);
    }
  };

  const filteredMembers = members.filter(m => 
    m.name.toLowerCase().includes(participantSearch.toLowerCase()) || 
    m.email.toLowerCase().includes(participantSearch.toLowerCase())
  );

  const titleText = mode === 'create' ? '新規予約' : mode === 'edit' ? '予約の編集' : '予約の詳細';

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'var(--theme-modal-overlay)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card w-full max-w-lg mx-4 p-6 animate-scale-in max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}
      >
        {/* ── ヘッダー ── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold" style={{ color: 'var(--theme-text)' }}>
              {titleText}
            </h2>
            {/* ステータスバッジ */}
            {isPending && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'oklch(0.65 0.18 60 / 0.15)', color: 'oklch(0.50 0.18 60)' }}
              >
                保留中
              </span>
            )}
            {initialData?.status === 'rejected' && (
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'oklch(0.62 0.22 25 / 0.1)', color: 'var(--color-danger-500)' }}
              >
                却下済み
              </span>
            )}
          </div>
          <button onClick={onClose} className="nav-btn !w-8 !h-8" aria-label="閉じる">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ロックUI の説明 */}
        {fullyLocked && !isAdmin && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm animate-fade-in"
            style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-card-border)', color: 'var(--theme-text-secondary)' }}>
            🔒 終了から1時間以上経過した予約は変更できません。
          </div>
        )}
        {startTimeLocked && !fullyLocked && !isAdmin && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm animate-fade-in"
            style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-card-border)', color: 'var(--theme-text-secondary)' }}>
            🔒 開始から1時間以上経過したため、開始時刻の変更と削除は制限されています。
          </div>
        )}

        {/* エラーメッセージ */}
        {errorMessage && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm font-medium animate-fade-in"
            style={{ background: 'oklch(0.62 0.22 25 / 0.08)', color: 'var(--color-danger-500)', border: '1px solid oklch(0.62 0.22 25 / 0.2)' }}>
            {errorMessage}
          </div>
        )}

        {/* ── フォーム ── */}
        <form onSubmit={handleSubmit} className="space-y-4">


          {/* 設備状態 */}
          {currentStatus && formData.date === todayStr && (
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>現在の設備状態:</span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: currentStatus.bg, color: currentStatus.color }}
              >
                {currentStatus.text}
              </span>
            </div>
          )}

          {/* 目的・用途 */}
          <div>
            <label className="form-label form-label-required">目的・用途</label>
            <input
              type="text" required disabled={isReadOnly}
              value={formData.purpose}
              onInput={(e) => updateField('purpose', (e.target as HTMLInputElement).value)}
              className="form-input" placeholder="例: チームミーティング"
            />
          </div>

          {/* 設備 */}
          <div>
            <label className="form-label form-label-required">設備</label>
            <select
              required disabled={isReadOnly}
              value={formData.facility_id}
              onChange={(e) => updateField('facility_id', (e.target as HTMLSelectElement).value)}
              className="form-input"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* 日付 */}
          <div>
            <label className="form-label form-label-required">日付</label>
            <input
              type="date" required disabled={isReadOnly}
              value={formData.date}
              onInput={(e) => updateField('date', (e.target as HTMLInputElement).value)}
              className="form-input"
            />
          </div>

          {/* 時間 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label form-label-required">開始時間</label>
              <input
                type="text" required disabled={disableStartTime}
                value={formData.start_time}
                onInput={(e) => updateField('start_time', (e.target as HTMLInputElement).value)}
                onBlur={() => handleTimeBlur('start_time')}
                className="form-input"
                placeholder="09:00 または 0900"
                style={disableStartTime && !isReadOnly ? { opacity: 0.5 } : undefined}
              />
            </div>
            <div>
              <label className="form-label form-label-required">終了時間</label>
              <input
                type="text" required disabled={isReadOnly}
                value={formData.end_time}
                onInput={(e) => updateField('end_time', (e.target as HTMLInputElement).value)}
                onBlur={() => handleTimeBlur('end_time')}
                className="form-input"
                placeholder="10:00 または 1000"
              />
            </div>
          </div>

          {/* 予約単位のヒント */}
          {!isReadOnly && (
            <p className="text-xs" style={{ color: 'var(--theme-text-secondary)', marginTop: '-8px' }}>
              ※ {appSettings.min_reservation_minutes}分単位 / 最大{appSettings.max_reservation_hours}時間
            </p>
          )}

          {/* 任意フィールド区切り */}
          <div className="pt-2">
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--theme-text-secondary)' }}>
              以下は任意項目です
            </p>
            <hr style={{ borderColor: 'var(--theme-card-border)' }} />
          </div>

          {/* メモ */}
          <div>
            <label className="form-label">メモ</label>
            <textarea
              disabled={isReadOnly} value={formData.memo}
              onInput={(e) => updateField('memo', (e.target as HTMLTextAreaElement).value)}
              className="form-input" rows={2} placeholder="自由にメモを残せます"
              style={{ resize: 'vertical', minHeight: '60px' }}
            />
          </div>

          {/* 連絡事項 */}
          <div>
            <label className="form-label">連絡事項</label>
            <textarea
              disabled={isReadOnly} value={formData.notice}
              onInput={(e) => updateField('notice', (e.target as HTMLTextAreaElement).value)}
              className="form-input" rows={2} placeholder="参加者に伝えたいことがあれば"
              style={{ resize: 'vertical', minHeight: '60px' }}
            />
          </div>

          {/* 参加者 */}
          <div>
            <label className="form-label">参加者</label>
            <div className="relative participant-dropdown-container">

              <div
                className="form-input flex items-center justify-between cursor-pointer"
                onClick={() => !isReadOnly && setShowParticipantDropdown(!showParticipantDropdown)}
                style={{ opacity: isReadOnly ? 0.6 : 1 }}
              >
                <span>{formData.participant_ids.length}名選択中</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--theme-text-secondary)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </div>
              {showParticipantDropdown && !isReadOnly && (
                <div className="absolute z-10 w-full mt-1 border rounded-lg shadow-lg" style={{ background: 'var(--theme-card-bg)', borderColor: 'var(--theme-card-border)' }}>
                  <div className="p-2 border-b" style={{ borderColor: 'var(--theme-card-border)' }}>
                    <input
                      type="text"
                      className="form-input w-full py-1.5 text-sm"
                      placeholder="名前・メールで検索..."
                      value={participantSearch}
                      onInput={(e) => setParticipantSearch((e.target as HTMLInputElement).value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {filteredMembers.length === 0 ? (
                      <p className="text-xs p-2" style={{ color: 'var(--theme-text-secondary)' }}>一致するメンバーがいません</p>
                    ) : (
                      <div className="space-y-1">
                        {filteredMembers.map((m) => {
                          const isSelected = formData.participant_ids.includes(m.id);
                          return (
                            <label
                              key={m.id}
                              className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
                              style={{ background: isSelected ? 'oklch(0.55 0.21 250 / 0.08)' : 'transparent' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox" checked={isSelected}
                                onChange={() => toggleParticipant(m.id)}
                                className="rounded text-primary-500 focus:ring-primary-500"
                              />
                              <span className="text-sm" style={{ color: 'var(--theme-text)' }}>{m.name}</span>
                              <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-secondary)' }}>{m.email}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── アクションボタン ── */}
          <div
            className="flex flex-wrap justify-end gap-3 pt-4 mt-2"
            style={{ borderTop: '1px solid var(--theme-card-border)' }}
          >
            {/* 管理者向け承認/却下ボタン */}
            {isAdmin && isPending && mode === 'edit' && (
              <>
                <button
                  type="button" onClick={handleReject} disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: 'var(--color-danger-500)', background: 'oklch(0.62 0.22 25 / 0.06)' }}
                >
                  却下
                </button>
                <button
                  type="button" onClick={handleApprove} disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all"
                  style={{ background: 'linear-gradient(135deg, oklch(0.55 0.18 145), oklch(0.50 0.16 155))' }}
                >
                  {isSubmitting ? '処理中...' : '承認'}
                </button>
                <div className="w-full h-0" />
              </>
            )}

            {/* 削除ボタン */}
            {mode === 'edit' && (
              <button
                type="button" onClick={handleDelete}
                disabled={isSubmitting || disableDelete}
                className="mr-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30"
                style={{ color: 'var(--color-danger-500)', background: 'oklch(0.62 0.22 25 / 0.06)' }}
                title={disableDelete && !isAdmin ? '開始から1時間以上経過した予約は削除できません' : undefined}
              >
                削除
              </button>
            )}

            {/* 閉じる */}
            <button
              type="button" onClick={onClose} disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              閉じる
            </button>

            {/* 保存 */}
            {!isReadOnly && (
              <button
                type="submit" disabled={isSubmitting}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, oklch(0.55 0.21 250), oklch(0.50 0.19 260))',
                  boxShadow: '0 2px 8px oklch(0.55 0.21 250 / 0.3)',
                }}
              >
                {isSubmitting ? '保存中...' : mode === 'create' ? '予約する' : '更新する'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}