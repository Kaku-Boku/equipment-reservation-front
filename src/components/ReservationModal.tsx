/**
 * 予約モーダルコンポーネント
 *
 * 3つのモードを持つ:
 * - create: 新規予約作成
 * - edit:   既存予約の編集（作成者 or admin）
 * - view:   閲覧専用（他ユーザーの予約）
 *
 * フォームフィールド:
 * - 目的・用途 *（必須）
 * - 設備 *（必須）
 * - 日付 *（必須）
 * - 開始時間 / 終了時間 *（必須）
 * - メモ（任意）
 * - 連絡事項（任意）
 * - 参加者（任意: 複数選択）
 *
 * バリデーション:
 * - 必須フィールドの入力チェック
 * - 終了時間 > 開始時間 の前後関係チェック
 */
import { useState, useEffect } from 'preact/hooks';

/** メンバー情報 */
interface MemberOption {
  id: string;
  name: string;
  email: string;
}

/** 設備情報 */
interface FacilityOption {
  id: string;
  name: string;
}

/** コンポーネント Props */
interface ModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  initialData: any;
  facilities: FacilityOption[];
  members: MemberOption[];
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

/** フォームの状態 */
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
  onClose,
  onSave,
  onDelete,
}: ModalProps) {
  const [formData, setFormData] = useState<FormState>({
    id: '',
    purpose: '',
    facility_id: '',
    date: '',
    start_time: '',
    end_time: '',
    memo: '',
    notice: '',
    participant_ids: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // モーダルが開くたびに初期データをセット
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

  if (!isOpen) return null;

  const isReadOnly = mode === 'view';

  /** 入力バリデーション */
  const validate = (): string | null => {
    if (!formData.purpose.trim()) return '目的・用途を入力してください。';
    if (!formData.facility_id) return '設備を選択してください。';
    if (!formData.date) return '日付を選択してください。';
    if (!formData.start_time) return '開始時間を入力してください。';
    if (!formData.end_time) return '終了時間を入力してください。';
    if (formData.start_time >= formData.end_time) {
      return '終了時間は開始時間より後に設定してください。';
    }
    return null;
  };

  /** フォーム送信 */
  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setErrorMessage('');

    const validationError = validate();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

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

  /** 予約削除 */
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

  /** 参加者の選択/解除をトグル */
  const toggleParticipant = (memberId: string) => {
    setFormData(prev => {
      const ids = prev.participant_ids.includes(memberId)
        ? prev.participant_ids.filter(id => id !== memberId)
        : [...prev.participant_ids, memberId];
      return { ...prev, participant_ids: ids };
    });
  };

  /** フィールド更新ヘルパー */
  const updateField = (field: keyof FormState, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const titleText = mode === 'create' ? '新規予約' : mode === 'edit' ? '予約の編集' : '予約の詳細';

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
          <h2 className="text-xl font-bold" style={{ color: 'var(--theme-text)' }}>
            {titleText}
          </h2>
          <button
            onClick={onClose}
            className="nav-btn !w-8 !h-8"
            aria-label="閉じる"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── エラーメッセージ ── */}
        {errorMessage && (
          <div
            className="mb-4 rounded-lg px-4 py-3 text-sm font-medium animate-fade-in"
            style={{
              background: 'oklch(0.62 0.22 25 / 0.08)',
              color: 'var(--color-danger-500)',
              border: '1px solid oklch(0.62 0.22 25 / 0.2)',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* ── フォーム ── */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* 目的・用途（必須） */}
          <div>
            <label className="form-label form-label-required">目的・用途</label>
            <input
              type="text"
              required
              disabled={isReadOnly}
              value={formData.purpose}
              onInput={(e) => updateField('purpose', (e.target as HTMLInputElement).value)}
              className="form-input"
              placeholder="例: チームミーティング"
            />
          </div>

          {/* 設備（必須） */}
          <div>
            <label className="form-label form-label-required">設備</label>
            <select
              required
              disabled={isReadOnly}
              value={formData.facility_id}
              onChange={(e) => updateField('facility_id', (e.target as HTMLSelectElement).value)}
              className="form-input"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* 日付と時間（必須） */}
          <div>
            <label className="form-label form-label-required">日付</label>
            <input
              type="date"
              required
              disabled={isReadOnly}
              value={formData.date}
              onInput={(e) => updateField('date', (e.target as HTMLInputElement).value)}
              className="form-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label form-label-required">開始時間</label>
              <input
                type="time"
                required
                disabled={isReadOnly}
                value={formData.start_time}
                onInput={(e) => updateField('start_time', (e.target as HTMLInputElement).value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label form-label-required">終了時間</label>
              <input
                type="time"
                required
                disabled={isReadOnly}
                value={formData.end_time}
                onInput={(e) => updateField('end_time', (e.target as HTMLInputElement).value)}
                className="form-input"
              />
            </div>
          </div>

          {/* ── 任意フィールドの区切り ── */}
          <div className="pt-2">
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--theme-text-secondary)' }}>
              以下は任意項目です
            </p>
            <hr style={{ borderColor: 'var(--theme-card-border)' }} />
          </div>

          {/* メモ（任意） */}
          <div>
            <label className="form-label">メモ</label>
            <textarea
              disabled={isReadOnly}
              value={formData.memo}
              onInput={(e) => updateField('memo', (e.target as HTMLTextAreaElement).value)}
              className="form-input"
              rows={2}
              placeholder="自由にメモを残せます"
              style={{ resize: 'vertical', minHeight: '60px' }}
            />
          </div>

          {/* 連絡事項（任意） */}
          <div>
            <label className="form-label">連絡事項</label>
            <textarea
              disabled={isReadOnly}
              value={formData.notice}
              onInput={(e) => updateField('notice', (e.target as HTMLTextAreaElement).value)}
              className="form-input"
              rows={2}
              placeholder="参加者に伝えたいことがあれば"
              style={{ resize: 'vertical', minHeight: '60px' }}
            />
          </div>

          {/* 参加者（任意: 複数選択） */}
          <div>
            <label className="form-label">参加者</label>
            <div
              className="rounded-lg p-3 max-h-[140px] overflow-y-auto"
              style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-input-border)' }}
            >
              {members.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>
                  メンバーが登録されていません
                </p>
              ) : (
                <div className="space-y-1">
                  {members.map((m) => {
                    const isSelected = formData.participant_ids.includes(m.id);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
                        style={{
                          background: isSelected ? 'oklch(0.55 0.21 250 / 0.08)' : 'transparent',
                          opacity: isReadOnly ? 0.6 : 1,
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={isSelected}
                          onChange={() => toggleParticipant(m.id)}
                          className="rounded text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm" style={{ color: 'var(--theme-text)' }}>
                          {m.name}
                        </span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--theme-text-secondary)' }}>
                          {m.email}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── アクションボタン ── */}
          <div
            className="flex justify-end gap-3 pt-4 mt-2"
            style={{ borderTop: '1px solid var(--theme-card-border)' }}
          >
            {/* 編集モード: 削除ボタン（左寄せ） */}
            {mode === 'edit' && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isSubmitting}
                className="mr-auto px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  color: 'var(--color-danger-500)',
                  background: 'oklch(0.62 0.22 25 / 0.06)',
                }}
              >
                削除
              </button>
            )}

            {/* 閉じる */}
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ color: 'var(--theme-text-secondary)' }}
            >
              閉じる
            </button>

            {/* 保存（新規 or 編集時のみ） */}
            {!isReadOnly && (
              <button
                type="submit"
                disabled={isSubmitting}
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