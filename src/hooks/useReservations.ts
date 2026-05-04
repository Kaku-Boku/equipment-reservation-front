/**
 * 予約データの取得・同期を管理するカスタムフック
 *
 * 機能:
 * - SSR で取得した初期データを起点にクライアント側でキャッシュ
 * - カレンダーナビゲーション時に範囲外のデータを追加取得
 *   ※ maxFutureDate を超える未来のデータは取得しない（帯域最適化）
 * - Supabase Realtime で INSERT/UPDATE/DELETE を差分同期
 *
 * 設計ポイント:
 * - Realtime ペイロードには JOIN データ（facilities, created_by_member）が含まれないため、
 *   INSERT/UPDATE イベント時は API 経由で完全なデータを再取得する
 * - Supabase クライアントは useMemo で永続化し、レンダーごとの再生成を防止
 */
import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** データ取得済み範囲を表す型 */
interface DateRange {
  start: string;
  end: string;
}

/** 予約データ（JOIN 済みの完全な形） */
interface Reservation {
  id: string;
  start_time: string;
  end_time: string;
  purpose: string;
  memo: string | null;
  notice: string | null;
  event_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  facilities: { id: string; name: string; status?: string } | null;
  created_by_member: { id: string; name: string } | null;
  reservation_participants?: { members: { id: string; name: string } }[];
}

/**
 * 予約データの管理フック
 *
 * @param initialData    - SSR でプリフェッチした予約配列
 * @param initialRange   - SSR でフェッチした日付範囲
 * @param supabaseUrl    - Supabase プロジェクトURL
 * @param supabaseKey    - Supabase 匿名キー
 * @param accessToken    - 認証済みセッショントークン
 * @param maxFutureDate  - フェッチの未来方向の上限日（管理者は undefined = 制限なし）
 */
export function useReservations(
  initialData: Reservation[],
  initialRange: DateRange,
  supabaseUrl: string,
  supabaseKey: string,
  accessToken: string,
  maxFutureDate?: Date
) {

  const [reservations, setReservations] = useState<Reservation[]>(initialData);
  const [loadedRange, setLoadedRange] = useState<DateRange>(initialRange);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  // Supabase クライアントをメモ化（再レンダーで再生成しない）
  const supabase = useMemo<SupabaseClient>(
    () => createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      accessToken: async () => accessToken,
    }),
    [supabaseUrl, supabaseKey, accessToken]
  );



  /** JOIN 付きの SELECT クエリ文字列（統一して使う） */
  const SELECT_WITH_JOINS =
    '*, facilities:facility_id (id, name, status), created_by_member:created_by (id, name)';

  // ── 追加データのフェッチ ──
  const fetchMoreIfNeeded = useCallback(async (targetDate: Date) => {
    const targetMs = targetDate.getTime();
    const startMs  = new Date(loadedRange.start).getTime();
    const endMs    = new Date(loadedRange.end).getTime();

    // 既に取得済みの範囲内ならスキップ
    if (targetMs >= startMs && targetMs <= endMs) return;

    setIsFetchingMore(true);

    // ターゲット月の前後 1 ヶ月分を追加取得
    const fetchStart = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1).toISOString();
    let fetchEndDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 2, 0);

    // maxFutureDate が設定されている場合、未来方向の取得を上限でキャップ
    if (maxFutureDate && fetchEndDate > maxFutureDate) {
      fetchEndDate = maxFutureDate;
    }
    const fetchEnd = fetchEndDate.toISOString();

    // フェッチ開始日が終了日を超えていたら何もしない
    if (new Date(fetchStart) > fetchEndDate) {
      setIsFetchingMore(false);
      return;
    }

    const { data, error } = await supabase
      .from('reservations')
      .select(SELECT_WITH_JOINS)
      .gte('start_time', fetchStart)
      .lte('end_time', fetchEnd);

    if (!error && data) {
      setReservations(prev => {
        // 既存データと結合し、ID で重複を排除
        const merged = [...prev, ...data];
        const unique = Array.from(
          new Map(merged.map(item => [item.id, item])).values()
        );
        return unique.sort(
          (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
        );
      });

      // 取得済み範囲を拡張
      setLoadedRange(prev => ({
        start: new Date(Math.min(new Date(prev.start).getTime(), new Date(fetchStart).getTime())).toISOString(),
        end:   new Date(Math.max(new Date(prev.end).getTime(),   new Date(fetchEnd).getTime())).toISOString(),
      }));
    }

    setIsFetchingMore(false);
  }, [loadedRange, supabase, maxFutureDate]);

  // ── Realtime サブスクリプション（差分同期） ──
  useEffect(() => {
    const channel = supabase
      .channel('realtime:reservations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations' },
        async (payload) => {
          const { eventType, old: oldRecord, new: newRecord } = payload;

          switch (eventType) {
            case 'DELETE': {
              const deletedId = (oldRecord as any)?.id;
              if (deletedId) {
                setReservations(prev => prev.filter(r => r.id !== deletedId));
              }
              break;
            }

            case 'INSERT':
            case 'UPDATE': {
              const recordId = (newRecord as any)?.id;
              if (!recordId) break;

              const { data, error } = await supabase
                .from('reservations')
                .select(SELECT_WITH_JOINS)
                .eq('id', recordId)
                .single();

              if (error || !data) break;

              setReservations(prev => {
                const filtered = prev.filter(r => r.id !== recordId);
                const merged = [...filtered, data];
                return merged.sort(
                  (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
                );
              });
              break;
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return { reservations, fetchMoreIfNeeded, isFetchingMore };
}