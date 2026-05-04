import { useState } from 'preact/hooks';
import type { Member } from '../../lib/types';

export interface MemberFull extends Member {
  status: string;
  created_at?: string;
}

export default function MembersTab({ initialMembers, currentMemberId }: { initialMembers: MemberFull[]; currentMemberId: string }) {
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
