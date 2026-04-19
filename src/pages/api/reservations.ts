/**
 * 予約データ取得API
 *
 * クエリパラメータ:
 * - date: YYYY-MM-DD (指定日の予約)
 * - month: YYYY-MM (月単位: カレンダー表示用の件数集計)
 *
 * Supabase の関連テーブルJOINを使って一撃でネストされたデータを取得する。
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  const { session, supabase } = locals;

  if (!session) {
    return new Response(
      JSON.stringify({ error: '認証が必要です。' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date');     // YYYY-MM-DD
  const month = url.searchParams.get('month');   // YYYY-MM

  try {
    if (date) {
      // 指定日の予約を詳細取得（タイムライン表示用）
      const dayStart = `${date}T00:00:00`;
      const dayEnd = `${date}T23:59:59`;

      const { data: reservations, error } = await supabase
        .from('reservations')
        .select(`
          id,
          start_time,
          end_time,
          purpose,
          memo,
          notice,
          event_id,
          facilities (id, name),
          created_by_member:members!reservations_created_by_fkey (id, name, email),
          reservation_participants (members (id, name))
        `)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .order('start_time');

      if (error) {
        console.error('[api/reservations] 日次取得エラー:', error);
        return new Response(
          JSON.stringify({ error: '予約データの取得に失敗しました。' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ reservations }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else if (month) {
      // 月単位: 各日の予約件数を取得（カレンダー表示用）
      const [year, mon] = month.split('-').map(Number);
      const monthStart = `${month}-01T00:00:00`;
      // 月末日を計算
      const lastDay = new Date(year, mon, 0).getDate();
      const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}T23:59:59`;

      const { data: reservations, error } = await supabase
        .from('reservations')
        .select('id, start_time, facilities (id, name)')
        .gte('start_time', monthStart)
        .lte('start_time', monthEnd)
        .order('start_time');

      if (error) {
        console.error('[api/reservations] 月次取得エラー:', error);
        return new Response(
          JSON.stringify({ error: '予約データの取得に失敗しました。' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 日付ごとの件数を集計
      const countByDate: Record<string, number> = {};
      reservations?.forEach((r: any) => {
        const d = r.start_time.split('T')[0];
        countByDate[d] = (countByDate[d] || 0) + 1;
      });

      return new Response(
        JSON.stringify({ countByDate, reservations }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'date または month パラメータを指定してください。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (err) {
    console.error('[api/reservations] 予期せぬエラー:', err);
    return new Response(
      JSON.stringify({ error: 'サーバーエラーが発生しました。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
