/**
 * Google OAuth コールバックエンドポイント
 *
 * Supabaseの PKCE フローにより、このエンドポイントには Google からの
 * 認可コード（code）が渡される。以下の順で処理する:
 *
 * 1. code を exchangeCodeForSession() でセッションに交換
 * 2. セッション内の provider_refresh_token を user_tokens テーブルに UPSERT
 *    - refresh_token は OAuth 直後のセッションにのみ含まれ、以降は取得できない
 *    - Google OAuth は access_type: 'offline' + prompt: 'consent' の設定により
 *      毎回新しい refresh_token を発行するため、ログインのたびに上書き保存する
 *    - provider_token（アクセストークン）は有効期限が短く保存不要（都度 refresh で取得）
 * 3. / にリダイレクト
 */
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    console.warn('[auth/callback] code パラメータがありません');
    return redirect('/login');
  }

  const supabase = createSupabaseServerClient(cookies, request.headers);

  // ── 1. 認可コード → セッション交換 ─────────────────────────────
  //
  // exchangeCodeForSession は:
  //   session.provider_token         = Google のアクセストークン（短命・1時間）
  //   session.provider_refresh_token = Google のリフレッシュトークン（永続的）
  // を返す。ただし provider_refresh_token は初回 or prompt:'consent' 時のみ返される。
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    console.error('[auth/callback] コード交換エラー:', error?.message);
    return redirect('/login?error=auth_failed');
  }

  const { session } = data;

  // ── 2. provider_refresh_token を user_tokens テーブルに保存 ─────
  //
  // ポイント:
  //   - provider_token（アクセストークン）は有効期限が1時間と短いため保存しない。
  //     Google Calendar API 呼び出し時は毎回 refresh_token から再取得する。
  //   - provider_refresh_token が null の場合は既存トークンが有効なためスキップ。
  //     （"prompt: 'consent'" なしで再ログインした場合など）
  if (session.provider_refresh_token) {
    const userEmail = session.user?.email;

    if (userEmail) {
      // members テーブルから member_id を取得（RLSポリシーに合わせ email で突合）
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id')
        .eq('email', userEmail)
        .eq('status', 'active')
        .single();

      if (memberError || !member) {
        // 存在しないメンバー → pre-check で弾かれるはずだが念のため
        console.error('[auth/callback] membersテーブルにユーザーが見つかりません:', userEmail);
        // トークン保存はスキップするがログイン自体は続行
      } else {
        // user_tokens テーブルに UPSERT（member_id が既存なら上書き）
        const { error: upsertError } = await supabase
          .from('user_tokens')
          .upsert(
            {
              member_id: member.id,
              refresh_token: session.provider_refresh_token,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'member_id' }
          );

        if (upsertError) {
          console.error('[auth/callback] user_tokens UPSERT エラー:', upsertError.message);
          // トークン保存失敗はカレンダー同期に影響するが、ログイン自体はブロックしない
        } else {
          console.log('[auth/callback] refresh_token 保存成功 (member_id:', member.id, ')');
        }
      }
    }
  } else {
    // refresh_token なし = 既存セッションの再ログインなど（Google側の判断）
    console.log('[auth/callback] provider_refresh_token なし（既存トークンを継続使用）');
  }

  // ── 3. 認証成功 → ホームへ ───────────────────────────────────────
  return redirect('/');
};
