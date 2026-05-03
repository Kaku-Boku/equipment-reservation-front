/**
 * 管理者ダッシュボードコンポーネント
 *
 * タブ切替で4つの管理機能を提供:
 * 1. 一般設定: app_settings の更新 + 共有カレンダー連携
 * 2. ユーザー管理: members 一覧・ロール変更・削除
 * 3. 設備管理: facilities 追加・編集・ステータス変更
 * 4. 予約承認: pending 予約の承認/却下
 */
import { useState } from 'preact/hooks';
import type { AppSettings, Member, Facility } from '../lib/types';

interface FacilityFull extends Facility {
  description?: string | null;
  created_at?: string;
}

interface MemberFull extends Member {
  status: string;
  created_at?: string;
}

interface Props {
  initialSettings: AppSettings;
  initialMembers: MemberFull[];
  initialFacilities: FacilityFull[];
  initialPendingReservations: any[];
  currentMember: Member;
  supabaseUrl: string;
  supabaseKey: string;
}

type TabId = 'settings' | 'members' | 'facilities' | 'approvals';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'settings', label: '一般設定', icon: '⚙️' },
  { id: 'members', label: 'ユーザー管理', icon: '👥' },
  { id: 'facilities', label: '設備管理', icon: '🏢' },
  { id: 'approvals', label: '予約承認', icon: '✅' },
];

export default function AdminDashboard({
  initialSettings,
  initialMembers,
  initialFacilities,
  initialPendingReservations,
  currentMember,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('settings');
  return (
    <div>
      {/* ページタイトル */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--theme-text)' }}>
          システム管理
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
          アプリケーション設定・ユーザー・設備を管理します
        </p>
      </div>

      {/* タブナビゲーション */}
      <div
        className="flex gap-1 rounded-xl p-1 mb-6 overflow-x-auto"
        style={{ background: 'var(--theme-input-bg)', border: '1px solid var(--theme-card-border)' }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap"
            style={{
              background: activeTab === tab.id ? 'var(--theme-card-bg)' : 'transparent',
              color: activeTab === tab.id ? 'var(--theme-text)' : 'var(--theme-text-secondary)',
              boxShadow: activeTab === tab.id ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <span>{tab.icon}</span> {tab.label}
            {tab.id === 'approvals' && initialPendingReservations.length > 0 && (
              <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: 'oklch(0.62 0.22 25)' }}>
                {initialPendingReservations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'settings' && <SettingsTab initialSettings={initialSettings} />}
      {activeTab === 'members' && <MembersTab initialMembers={initialMembers} currentMemberId={currentMember.id} />}
      {activeTab === 'facilities' && <FacilitiesTab initialFacilities={initialFacilities} />}
      {activeTab === 'approvals' && <ApprovalsTab initialReservations={initialPendingReservations} />}
    </div>
  );
}

/* ==========================================================================
 * 一般設定タブ
 * ========================================================================== */
function SettingsTab({ initialSettings }: { initialSettings: AppSettings }) {
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
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
        <input type="number" value={(settings as any)[key]}
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
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);
              setSettings(s => ({ ...s, shared_calendar_email: data.email }));
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

/* ==========================================================================
 * ユーザー管理タブ
 * ========================================================================== */
function MembersTab({ initialMembers, currentMemberId }: { initialMembers: MemberFull[]; currentMemberId: string }) {
  const [members, setMembers] = useState(initialMembers);
  const [busy, setBusy] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user');

  const addMember = async () => {
    if (!newName.trim() || !newEmail.trim()) return;
    setBusy('add');
    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      setMembers(prev => [data.member, ...prev]);
      setNewName('');
      setNewEmail('');
      setNewRole('user');
    } finally { setBusy(''); }
  };

  const changeRole = async (id: string, role: 'admin' | 'user') => {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/members', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error); return; }
      setMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m));
    } finally { setBusy(''); }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const actionName = newStatus === 'active' ? '有効化' : '無効化';
    if (!confirm(`このアカウントを${actionName}しますか？`)) return;
    setBusy(id);
    try {
      const res = await fetch('/api/admin/members', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, restore: newStatus === 'active' }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error); return; }
      setMembers(prev => prev.map(m => m.id === id ? { ...m, status: newStatus } : m));
    } finally { setBusy(''); }
  };

  const filteredMembers = members.filter(m => showAll || m.status === 'active');

  return (
    <div className="space-y-4">
      {/* 新規追加 */}
      <div className="card p-4 rounded-xl flex flex-wrap gap-3 items-end" style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
        <div className="flex-1 min-w-[150px]">
          <label className="form-label">名前</label>
          <input type="text" value={newName} onInput={e => setNewName((e.target as HTMLInputElement).value)}
            className="form-input" placeholder="例: 山田 太郎" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="form-label">メールアドレス</label>
          <input type="email" value={newEmail} onInput={e => setNewEmail((e.target as HTMLInputElement).value)}
            className="form-input" placeholder="例: yamada@example.com" />
        </div>
        <div className="w-[120px]">
          <label className="form-label">権限</label>
          <select value={newRole} onChange={e => setNewRole((e.target as HTMLSelectElement).value as any)} className="form-input">
            <option value="user">一般</option>
            <option value="admin">管理者</option>
          </select>
        </div>
        <button onClick={addMember} disabled={busy === 'add' || !newName.trim() || !newEmail.trim()}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, oklch(0.55 0.21 250), oklch(0.50 0.19 260))' }}>
          追加
        </button>
      </div>

      <div className="flex items-center justify-end gap-2 px-1">
        <input type="checkbox" id="show-all" checked={showAll} onChange={e => setShowAll((e.target as HTMLInputElement).checked)} />
        <label htmlFor="show-all" className="text-sm cursor-pointer" style={{ color: 'var(--theme-text)' }}>すべてのユーザーを表示</label>
      </div>

      <div className="card rounded-xl overflow-hidden" style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--theme-card-border)', background: 'var(--theme-input-bg)' }}>
              {['名前', 'メール', 'ロール', 'ステータス', '操作'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map(m => {
              const isSelf = m.id === currentMemberId;
              const isInactive = m.status === 'inactive';
              return (
                <tr key={m.id} style={{ borderBottom: '1px solid var(--theme-card-border)', opacity: isInactive ? 0.5 : 1 }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--theme-text)' }}>{m.name}</td>
                  <td className="px-4 py-3" style={{ color: 'var(--theme-text-secondary)' }}>{m.email}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: m.role === 'admin' ? 'oklch(0.55 0.21 250 / 0.12)' : 'var(--theme-input-bg)', color: m.role === 'admin' ? 'var(--color-primary-500)' : 'var(--theme-text-secondary)' }}>
                      {m.role === 'admin' ? '管理者' : '一般'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs" style={{ color: isInactive ? 'var(--color-danger-500)' : 'oklch(0.45 0.18 145)' }}>
                      {isInactive ? '無効' : '有効'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {!isSelf && (
                      <div className="flex gap-2">
                        {!isInactive && (
                          <button disabled={busy === m.id} onClick={() => changeRole(m.id, m.role === 'admin' ? 'user' : 'admin')}
                            className="text-xs px-2 py-1 rounded-md transition-colors"
                            style={{ background: 'var(--theme-input-bg)', color: 'var(--theme-text-secondary)' }}>
                            {m.role === 'admin' ? '一般に変更' : '管理者に変更'}
                          </button>
                        )}
                        <button disabled={busy === m.id} onClick={() => toggleStatus(m.id, m.status)}
                          className="text-xs px-2 py-1 rounded-md transition-colors"
                          style={{ color: isInactive ? 'oklch(0.45 0.18 145)' : 'var(--color-danger-500)', background: isInactive ? 'oklch(0.55 0.18 145 / 0.08)' : 'oklch(0.62 0.22 25 / 0.06)' }}>
                          {isInactive ? '有効化' : '無効化'}
                        </button>
                      </div>
                    )}
                    {isSelf && <span className="text-xs" style={{ color: 'var(--theme-text-secondary)' }}>自分</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}

/* ==========================================================================
 * 設備管理タブ
 * ========================================================================== */
// FacilityFull は上部で定義済み

function FacilitiesTab({ initialFacilities }: { initialFacilities: FacilityFull[] }) {
  const [facilities, setFacilities] = useState(initialFacilities);
  const [editing, setEditing] = useState<FacilityFull | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const addFacility = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/facilities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      setFacilities(prev => [...prev, { ...data.facility, description: newDesc || null }]);
      setNewName(''); setNewDesc('');
    } finally { setBusy(false); }
  };

  const updateFacility = async (f: FacilityFull) => {
    setBusy(true);
    try {
      const res = await fetch('/api/facilities', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, name: f.name, description: f.description, status: f.status }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error); return; }
      setFacilities(prev => prev.map(x => x.id === f.id ? f : x));
      setEditing(null);
    } finally { setBusy(false); }
  };

  const statusLabel = (s: string) => s === 'active' ? '稼働中' : s === 'maintenance' ? 'メンテナンス' : '廃止';
  const statusColor = (s: string) => s === 'active' ? 'oklch(0.45 0.18 145)' : s === 'maintenance' ? 'oklch(0.55 0.18 60)' : 'var(--color-danger-500)';

  return (
    <div className="space-y-4">
      {/* 新規追加 */}
      <div className="card p-4 rounded-xl flex flex-wrap gap-3 items-end" style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
        <div className="flex-1 min-w-[200px]">
          <label className="form-label">設備名</label>
          <input type="text" value={newName} onInput={e => setNewName((e.target as HTMLInputElement).value)}
            className="form-input" placeholder="例: 会議室A" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="form-label">説明</label>
          <input type="text" value={newDesc} onInput={e => setNewDesc((e.target as HTMLInputElement).value)}
            className="form-input" placeholder="任意" />
        </div>
        <button onClick={addFacility} disabled={busy || !newName.trim()}
          className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, oklch(0.55 0.21 250), oklch(0.50 0.19 260))' }}>
          追加
        </button>
      </div>

      {/* 一覧 */}
      <div className="card rounded-xl overflow-hidden" style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--theme-card-border)', background: 'var(--theme-input-bg)' }}>
                {['設備名', '説明', 'ステータス', '操作'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--theme-text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facilities.filter(f => f.status !== 'retired').map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--theme-card-border)' }}>
                  <td className="px-4 py-3 font-medium" style={{ color: 'var(--theme-text)' }}>
                    {editing?.id === f.id ? (
                      <input type="text" value={editing.name} onInput={e => setEditing({ ...editing, name: (e.target as HTMLInputElement).value })} className="form-input" />
                    ) : f.name}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--theme-text-secondary)' }}>
                    {editing?.id === f.id ? (
                      <input type="text" value={editing.description || ''} onInput={e => setEditing({ ...editing, description: (e.target as HTMLInputElement).value })} className="form-input" />
                    ) : (f.description || '-')}
                  </td>
                  <td className="px-4 py-3">
                    {editing?.id === f.id ? (
                      <select value={editing.status} onChange={e => setEditing({ ...editing, status: (e.target as HTMLSelectElement).value as any })} className="form-input">
                        <option value="active">稼働中</option>
                        <option value="maintenance">メンテナンス</option>
                        <option value="retired">廃止</option>
                      </select>
                    ) : (
                      <span className="text-xs font-semibold" style={{ color: statusColor(f.status) }}>{statusLabel(f.status)}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editing?.id === f.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => updateFacility(editing)} disabled={busy}
                          className="text-xs px-2 py-1 rounded-md text-white" style={{ background: 'oklch(0.55 0.21 250)' }}>保存</button>
                        <button onClick={() => setEditing(null)} className="text-xs px-2 py-1 rounded-md" style={{ color: 'var(--theme-text-secondary)' }}>取消</button>
                      </div>
                    ) : (
                      <button onClick={() => setEditing({ ...f })}
                        className="text-xs px-2 py-1 rounded-md transition-colors" style={{ background: 'var(--theme-input-bg)', color: 'var(--theme-text-secondary)' }}>編集</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * 予約承認タブ
 * ========================================================================== */
function ApprovalsTab({ initialReservations }: { initialReservations: any[] }) {
  const [reservations, setReservations] = useState(initialReservations);
  const [busy, setBusy] = useState('');

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    setBusy(id);
    try {
      const res = await fetch('/api/approve', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error); return; }
      setReservations(prev => prev.filter(r => r.id !== id));
    } finally { setBusy(''); }
  };

  const fmtDt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  if (reservations.length === 0) {
    return (
      <div className="card p-8 rounded-xl text-center" style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
        <p className="text-lg mb-1" style={{ color: 'var(--theme-text-secondary)' }}>✅</p>
        <p className="text-sm" style={{ color: 'var(--theme-text-secondary)' }}>承認待ちの予約はありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reservations.map(r => (
        <div key={r.id} className="card p-4 rounded-xl flex flex-wrap items-center gap-4"
          style={{ background: 'var(--theme-card-bg)', border: '1px solid var(--theme-card-border)' }}>
          <div className="flex-1 min-w-[200px]">
            <p className="font-semibold text-sm" style={{ color: 'var(--theme-text)' }}>{r.purpose}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--theme-text-secondary)' }}>
              {r.facilities?.name} | {fmtDt(r.start_time)} 〜 {fmtDt(r.end_time)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--theme-text-secondary)' }}>
              申請者: {r.created_by_member?.name} ({r.created_by_member?.email})
            </p>
          </div>
          <div className="flex gap-2">
            <button disabled={busy === r.id} onClick={() => handleAction(r.id, 'approved')}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, oklch(0.55 0.18 145), oklch(0.50 0.16 155))' }}>
              承認
            </button>
            <button disabled={busy === r.id} onClick={() => handleAction(r.id, 'rejected')}
              className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ color: 'var(--color-danger-500)', background: 'oklch(0.62 0.22 25 / 0.06)' }}>
              却下
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
