/**
 * Astro SSR ミドルウェア
 *
 * 全リクエストに対して以下を実行:
 * 1. CookieからSupabaseセッションを復元
 * 2. Astro.locals にクライアント・セッション・メンバー情報を注入
 * 3. 保護ルートへの未認証アクセスを /login へリダイレクト
 */
import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase';

/** 認証不要なパスのプレフィックス */
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/pre-check'];

export const onRequest = defineMiddleware(async ({ locals, cookies, request, redirect }, next) => {
  // 全リクエストでSupabaseサーバークライアントを生成
  const supabase = createSupabaseServerClient(cookies, request.headers);
  locals.supabase = supabase;

  // セッション取得
  const { data: { session } } = await supabase.auth.getSession();
  locals.session = session;
  locals.member = null;

  const url = new URL(request.url);
  const isPublicPath = PUBLIC_PATHS.some((path) => url.pathname.startsWith(path));

  if (session?.user) {
    // セッション有り: メンバー情報を取得して locals に注入
    const { data: member } = await supabase
      .from('members')
      .select('id, email, name, role')
      .eq('email', session.user.email)
      .eq('status', 'active')
      .single();

    locals.member = member;

    // ログイン済みなのに /login にアクセスした場合は / にリダイレクト
    if (url.pathname === '/login') {
      return redirect('/');
    }
  } else if (!isPublicPath) {
    // セッション無し & 保護ルート → ログインへリダイレクト
    return redirect('/login');
  }

  return next();
});
