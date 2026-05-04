/**
 * アプリケーション設定 CRUD API（管理者専用）
 *
 * GET: app_settings を取得
 * PUT: app_settings を更新
 *
 * Note: ミドルウェアで /api/admin/* を管理者のみに制限しているが、
 *       防御的プログラミングとして各ルート内でも権限チェックを行う。
 */
import type { APIRoute } from 'astro';
import { JSON_HEADERS, checkAdmin, errorResponse } from '../../../lib/api-utils';
import { logger } from '../../../lib/logger';

export const GET: APIRoute = async ({ locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase } = locals;
  const { data, error } = await supabase.from('app_settings').select('*').single();
  if (error) {
    logger.error('[api/admin/settings GET] エラー:', error);
    return errorResponse('設定の取得に失敗しました。');
  }

  return new Response(JSON.stringify({ settings: data }), { status: 200, headers: JSON_HEADERS });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase, member } = locals;

  try {
    const body = await request.json();
    const {
      start_hour, end_hour,
      reservation_lead_time_days,
      max_reservation_hours, min_reservation_minutes,
      auto_approve, shared_calendar_enabled,
    } = body;

    // バリデーション
    if (start_hour >= end_hour) {
      return new Response(
        JSON.stringify({ error: '終了時間は開始時間より後に設定してください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }
    if (reservation_lead_time_days < 1) {
      return new Response(
        JSON.stringify({ error: '予約可能日数は1以上に設定してください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }
    if (min_reservation_minutes < 1) {
      return new Response(
        JSON.stringify({ error: '最小予約単位は1分以上に設定してください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const { error } = await supabase
      .from('app_settings')
      .update({
        start_hour, end_hour,
        reservation_lead_time_days,
        max_reservation_hours, min_reservation_minutes,
        auto_approve, shared_calendar_enabled,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (error) {
      logger.error('[api/admin/settings PUT] エラー:', error);
      return errorResponse('設定の更新に失敗しました。');
    }

    logger.info('[api/admin/settings PUT] 設定を更新しました（by', member!.email, ')');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/admin/settings PUT] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
  }
};
