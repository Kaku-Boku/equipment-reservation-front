/**
 * 共有カレンダー連携（自分のアカウントを使用）API
 *
 * 管理者が自身のGoogleアカウントを「共有カレンダー」として連携する。
 * user_tokens から管理者の refresh_token を取得し、app_secrets にコピーする。
 */
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';
import { JSON_HEADERS, checkAdmin, errorResponse } from '../../../lib/api-utils';
import { logger } from '../../../lib/logger';


export const POST: APIRoute = async ({ locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase, member } = locals;

  try {
    // 1. user_tokens から現在の管理者の refresh_token を取得
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('refresh_token')
      .eq('member_id', member.id)
      .single();

    if (tokenError || !tokenData || !tokenData.refresh_token) {
      logger.error('[api/admin/link-shared-calendar] token error:', tokenError);

      return new Response(
        JSON.stringify({ error: 'トークンが見つかりません。一度ログアウトし、再ログインしてください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // 2. app_secrets に保存
    const adminClient = createSupabaseAdminClient();
    const { error: secretsError } = await adminClient
      .from('app_secrets')
      .update({
        shared_calendar_refresh_token: tokenData.refresh_token,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (secretsError) {
      logger.error('[api/admin/link-shared-calendar] secrets update error:', secretsError);
      return errorResponse('トークンの保存に失敗しました。');
    }


    // 3. app_settings の更新
    const { error: settingsError } = await supabase
      .from('app_settings')
      .update({
        shared_calendar_email: member.email,
        shared_calendar_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    if (settingsError) {
      logger.error('[api/admin/link-shared-calendar] settings update error:', settingsError);
      return errorResponse('設定の更新に失敗しました。');
    }


    return new Response(JSON.stringify({ ok: true, email: member.email }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/admin/link-shared-calendar] unexpected error:', err);
    return errorResponse('サーバーエラーが発生しました。');
  }

};
