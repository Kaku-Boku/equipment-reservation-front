/**
 * 共有カレンダー連携（自分のアカウントを使用）API
 *
 * 管理者が自身のGoogleアカウントを「共有カレンダー」として連携する。
 * user_tokens から管理者の refresh_token を取得し、app_secrets にコピーする。
 */
import type { APIRoute } from 'astro';
import { createSupabaseAdminClient } from '../../../lib/supabase';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const POST: APIRoute = async ({ locals }) => {
  const { session, member, supabase } = locals;

  if (!session || !member) {
    return new Response(JSON.stringify({ error: '認証が必要です。' }), { status: 401, headers: JSON_HEADERS });
  }
  if (member.role !== 'admin') {
    return new Response(JSON.stringify({ error: '管理者のみ設定できます。' }), { status: 403, headers: JSON_HEADERS });
  }

  try {
    // 1. user_tokens から現在の管理者の refresh_token を取得
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .select('refresh_token')
      .eq('member_id', member.id)
      .single();

    if (tokenError || !tokenData || !tokenData.refresh_token) {
      console.error('[api/admin/link-shared-calendar] token error:', tokenError);
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
      console.error('[api/admin/link-shared-calendar] secrets update error:', secretsError);
      return new Response(JSON.stringify({ error: 'トークンの保存に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
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
      console.error('[api/admin/link-shared-calendar] settings update error:', settingsError);
      return new Response(JSON.stringify({ error: '設定の更新に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ ok: true, email: member.email }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[api/admin/link-shared-calendar] unexpected error:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました。' }), { status: 500, headers: JSON_HEADERS });
  }
};
