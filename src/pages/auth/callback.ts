/**
 * Google OAuth コールバックエンドポイント
 *
 * Google OAuth認証後のリダイレクト先。
 * 認可コードをセッションに交換し、Cookieに保存する。
 *
 * 【重要】provider_refresh_token を user_tokens テーブルに保存する。
 * この値はOAuth直後のセッションにのみ含まれ、以降は取得できないため、
 * このコールバック内で確実に永続化する必要がある。
 */
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';
import { saveProviderRefreshToken } from '../../lib/google-calendar';

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    // コードが無い場合はログインに戻す
    return redirect('/login');
  }

  const supabase = createSupabaseServerClient(cookies, request.headers);

  // 認可コードをセッションに交換
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.session) {
    console.error('[auth/callback] コード交換エラー:', error?.message);
    return redirect('/login?error=auth_failed');
  }

  const session = data.session;

  // ---------- provider_refresh_token の永続化 ----------
  // Google OAuth の refresh_token はセッション確立直後のみ取得可能。
  // access_type: 'offline' + prompt: 'consent' の設定により、
  // 毎回新しい refresh_token が発行される。
  if (session.provider_refresh_token) {
    try {
      // JWT からメールを取得してメンバーIDを特定
      const userEmail = session.user?.email;
      if (userEmail) {
        const { data: member } = await supabase
          .from('members')
          .select('id')
          .eq('email', userEmail)
          .eq('status', 'active')
          .single();

        if (member) {
          await saveProviderRefreshToken(supabase, member.id, session.provider_refresh_token);
        } else {
          console.warn('[auth/callback] メンバーが見つかりません:', userEmail);
        }
      }
    } catch (tokenError) {
      // トークン保存失敗は致命的ではない（ログイン自体は成功させる）
      console.error('[auth/callback] provider_refresh_token 保存エラー:', tokenError);
    }
  } else {
    console.warn('[auth/callback] provider_refresh_token が返されませんでした');
  }

  // セッション確立成功 → ホームにリダイレクト
  return redirect('/');
};
