import { useState } from 'preact/hooks';
import type { Facility } from '../../lib/types';

export interface FacilityFull extends Facility {
  description?: string | null;
  created_at?: string;
}

export default function FacilitiesTab({ initialFacilities }: { initialFacilities: FacilityFull[] }) {
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
