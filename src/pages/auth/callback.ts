/**
 * Google OAuth コールバックエンドポイント
 *
 * Supabase の PKCE フローにより、このエンドポイントには
 * 認可コード（code）が渡される。以下の順で処理する:
 *
 * 1. code を exchangeCodeForSession() でセッションに交換
 * 2. provider_refresh_token を user_tokens テーブルに UPSERT
 * 3. / にリダイレクト
 *
 * 【前提】
 * クライアント側で createBrowserClient (@supabase/ssr) を使用すること。
 * createBrowserClient は PKCE の code_verifier を Cookie に保存するため、
 * このサーバー側で exchangeCodeForSession() が code_verifier を読み取れる。
 * 素の createClient は localStorage に保存するため、サーバー側では読み取れず失敗する。
 */
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';
// @ts-ignore
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  console.log('[auth/callback] ========== コールバック開始 ==========');

  if (!code) {
    console.error('[auth/callback] code パラメータがありません');
    return redirect('/login?error=no_code');
  }

  const runtimeEnv = env || {};
  const supabase = createSupabaseServerClient(cookies, request.headers, runtimeEnv);

  // ── 1. 認可コード → セッション交換 ──
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession エラー:', {
      message: error.message,
      status: error.status,
    });
    return redirect('/login?error=auth_failed');
  }

  if (!data?.session) {
    console.error('[auth/callback] セッションが返されませんでした');
    return redirect('/login?error=no_session');
  }

  const { session } = data;
  console.log('[auth/callback] セッション交換成功:', {
    user_email: session.user?.email,
    has_provider_refresh_token: Boolean(session.provider_refresh_token),
  });

  // ── 2. provider_refresh_token を user_tokens テーブルに保存 ──
  //
  // provider_refresh_token は OAuth 直後のセッションにのみ含まれる。
  // access_type: 'offline' + prompt: 'consent' を設定しているため
  // 毎回返されるはずだが、Google 側の判断で返されない場合もある。
  let tokenWarning = false;

  if (session.provider_refresh_token) {
    const userEmail = session.user?.email;
    if (userEmail) {
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id')
        .eq('email', userEmail)
        .eq('status', 'active')
        .single();

      if (memberError || !member) {
        console.error('[auth/callback] members にユーザーが見つかりません:', userEmail);
      } else {
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
        } else {
          console.log('[auth/callback] refresh_token 保存成功 (member_id:', member.id, ')');
        }
      }
    }
  } else {
    // provider_refresh_token が null → Google Calendar 連携が不可
    tokenWarning = true;
    console.warn('[auth/callback] provider_refresh_token が返されませんでした。', {
      user_email: session.user?.email,
      hint: 'prompt: "consent" + access_type: "offline" の設定を確認してください。',
    });
  }

  // ── 3. 認証成功 → ホームへリダイレクト ──
  console.log('[auth/callback] ========== コールバック完了 ==========');

  if (tokenWarning) {
    return redirect('/?warning=token_missing');
  }

  return redirect('/');
};
