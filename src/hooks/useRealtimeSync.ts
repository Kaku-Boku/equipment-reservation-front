/**
 * 設備（facilities）とメンバー（members）のリアルタイム更新を管理するフック
 */
import { useEffect } from 'preact/hooks';
import { createClient } from '@supabase/supabase-js';
import type { Facility, Member } from '../lib/types';

export function useRealtimeSync(
  supabaseUrl: string,
  supabaseKey: string,
  accessToken: string,
  setFacilities: (facilities: Facility[]) => void,
  setMembers: (members: Member[]) => void
) {
  useEffect(() => {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      accessToken: async () => accessToken,
    });

    const channel = supabase.channel('app_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'facilities' },
        async () => {
          const { data } = await supabase.from('facilities').select('*').order('name');
          if (data) setFacilities(data);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        async () => {
          const { data } = await supabase.from('members').select('*').eq('status', 'active').order('name');
          if (data) setMembers(data as Member[]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabaseUrl, supabaseKey, accessToken, setFacilities, setMembers]);
}
