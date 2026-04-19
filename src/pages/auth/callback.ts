/**
 * Google OAuth コールバックエンドポイント
 *
 * Google OAuth認証後のリダイレクト先。
 * 認可コードをセッションに交換し、Cookieに保存してホームにリダイレクトする。
 */
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (!code) {
    // コードが無い場合はログインに戻す
    return redirect('/login');
  }

  const supabase = createSupabaseServerClient(cookies, request.headers);

  // 認可コードをセッションに交換
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth/callback] コード交換エラー:', error.message);
    return redirect('/login?error=auth_failed');
  }

  // セッション確立成功 → ホームにリダイレクト
  return redirect('/');
};
