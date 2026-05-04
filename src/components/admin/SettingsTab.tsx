import { useState } from 'preact/hooks';
import type { AppSettings } from '../../lib/types';

export default function SettingsTab({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState({ ...initialSettings });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || '保存に失敗しました');
      setMsg({ type: 'ok', text: '設定を保存しました。' });
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message || '保存に失敗しました。' });
    } finally { setSaving(false); }
  };

  const field = (label: string, key: keyof AppSettings, type: 'number' | 'checkbox' = 'number') => (
    <div className="flex items-center justify-between gap-4 py-3" style={{ borderBottom: '1px solid var(--theme-card-border)' }}>
      <label className="text-sm font-medium" style={{ color: 'var(--theme-text)' }}>{label}</label>
      {type === 'checkbox' ? (
        <button
          onClick={() => setSettings(s => ({ ...s, [key]: !(s as any)[key] }))}
          className="relative w-11 h-6 rounded-full transition-colors"
          style={{ background: (settings as any)[key] ? 'oklch(0.55 0.21 250)' : 'var(--theme-card-border)' }}
        >
          <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform shadow-sm"
            style={{ transform: (settings as any)[key] ? 'translateX(20px)' : 'translateX(0)' }} />
        </button>
      ) : (
        <input type="number" value={(settings as any)[key] as number}
          onInput={e => setSettings(s => ({ ...s, [key]: parseInt((e.target as HTMLInputElement).value) || 0 }))}
          className="form-input w-24 text-center" />
      )}
    </div>
  );

  return (
    <div className="card p-6 rounded-xl" style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
      <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--theme-text)' }}>タイムライン・予約設定</h2>
      {field('開始時間 (時)', 'start_hour')}
      {field('終了時間 (時)', 'end_hour')}
      {field('予約可能日数', 'reservation_lead_time_days')}
      {field('最大予約時間 (時間)', 'max_reservation_hours')}
      {field('最小予約単位 (分)', 'min_reservation_minutes')}
      {field('自動承認', 'auto_approve', 'checkbox')}
      {field('共有カレンダー連携', 'shared_calendar_enabled', 'checkbox')}

      {settings.shared_calendar_enabled && (
        <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-card-border)' }}>
          <p className="text-sm mb-2" style={{ color: 'var(--theme-text-secondary)' }}>
            連携アカウント: {settings.shared_calendar_email || '未設定'}
          </p>
          <p className="text-xs mb-3 text-gray-500">
            ※現在ログインしている自分のアカウントを共有カレンダーとしてシステムに連携します。
          </p>
          <button onClick={async () => {
            setSaving(true);
            setMsg(null);
            try {
              const res = await fetch('/api/admin/link-shared-calendar', { method: 'POST' });
              const data = await res.json() as { email?: string; error?: string };
              if (!res.ok) throw new Error(data.error || '連携に失敗しました');
              setSettings(s => ({ ...s, shared_calendar_email: data.email || null }));
              setMsg({ type: 'ok', text: 'カレンダーを連携しました。' });
            } catch (e: any) {
              setMsg({ type: 'err', text: e.message || '連携に失敗しました。' });
            } finally { setSaving(false); }
          }} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, oklch(0.55 0.21 250), oklch(0.50 0.19 260))', border: 'none', cursor: 'pointer' }}>
            {settings.shared_calendar_email ? '再連携' : '自分のアカウントを連携'}
          </button>
        </div>
      )}

      {msg && (
        <div className="mt-4 rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            background: msg.type === 'ok' ? 'oklch(0.55 0.18 145 / 0.08)' : 'oklch(0.62 0.22 25 / 0.08)',
            color: msg.type === 'ok' ? 'oklch(0.45 0.18 145)' : 'var(--color-danger-500)',
          }}>{msg.text}</div>
      )}

      <button onClick={handleSave} disabled={saving}
        className="mt-5 w-full px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
        style={{ background: 'linear-gradient(135deg, oklch(0.55 0.21 250), oklch(0.50 0.19 260))' }}>
        {saving ? '保存中...' : '設定を保存'}
      </button>
    </div>
  );
}
