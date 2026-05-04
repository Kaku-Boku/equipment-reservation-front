/**
 * 予約データ取得 API
 *
 * クエリパラメータ:
 * - date:  YYYY-MM-DD（指定日の予約を詳細取得 → タイムライン表示用）
 * - month: YYYY-MM（月単位で予約件数を集計 → カレンダー表示用）
 *
 * Supabase の関連テーブル JOIN を活用して
 * ネストされたデータを一度のクエリで取得する。
 */
import type { APIRoute } from 'astro';
import { JSON_HEADERS, errorResponse } from '../../lib/api-utils';
import { logger } from '../../lib/logger';

export const GET: APIRoute = async ({ request, locals }) => {
  const { session, member, supabase } = locals;

  if (!session || !member) {
    return errorResponse('認証が必要です。', 401);
  }

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const month = url.searchParams.get('month');

  try {
    if (date) {
      // ── 指定日の予約を詳細取得（タイムライン表示用） ──
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
          status,
          facilities (id, name, status),
          created_by_member:members!reservations_created_by_fkey (id, name, email),
          reservation_participants (members (id, name))
        `)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd)
        .order('start_time');

      if (error) {
        logger.error('[api/reservations] 日次取得エラー:', error);
        return errorResponse('予約データの取得に失敗しました。');
      }


      return new Response(
        JSON.stringify({ reservations }),
        { status: 200, headers: JSON_HEADERS }
      );

    } else if (month) {
      // ── 月単位: 各日の予約件数を集計（カレンダー表示用） ──
      const [year, mon] = month.split('-').map(Number);
      const monthStart = `${month}-01T00:00:00`;
      const lastDay = new Date(year, mon, 0).getDate();
      const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}T23:59:59`;

      const { data: reservations, error } = await supabase
        .from('reservations')
        .select('id, start_time, status, facilities (id, name, status)')
        .gte('start_time', monthStart)
        .lte('start_time', monthEnd)
        .order('start_time');

      if (error) {
        logger.error('[api/reservations] 月次取得エラー:', error);
        return errorResponse('予約データの取得に失敗しました。');
      }


      // 日付ごとの件数を集計
      const countByDate: Record<string, number> = {};
      reservations?.forEach((r: any) => {
        const d = r.start_time.split('T')[0];
        countByDate[d] = (countByDate[d] || 0) + 1;
      });

      return new Response(
        JSON.stringify({ countByDate, reservations }),
        { status: 200, headers: JSON_HEADERS }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'date または month パラメータを指定してください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }
  } catch (err) {
    logger.error('[api/reservations] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
  }

};
