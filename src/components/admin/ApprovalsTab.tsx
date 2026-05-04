import { useState, useEffect } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';

export default function ApprovalsTab({ initialReservations, supabaseUrl, supabaseKey, accessToken }: { initialReservations: any[], supabaseUrl: string, supabaseKey: string, accessToken: string }) {
  const [reservations, setReservations] = useState(initialReservations);
  const [busy, setBusy] = useState('');

  // ── Realtime 購読 (reservations) ──
  useEffect(() => {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      accessToken: async () => accessToken,
    });

    const channel = supabase.channel('approvals_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: 'status=eq.pending' },
        async () => {
          // fetch pending reservations again to get joined data (facilities, members)
          const { data } = await supabase
            .from('reservations')
            .select(`
              id, start_time, end_time, purpose, status,
              facilities (id, name),
              created_by_member:members!reservations_created_by_fkey (id, name, email)
            `)
            .eq('status', 'pending')
            .order('start_time');
          if (data) setReservations(data);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabaseUrl, supabaseKey]);

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
