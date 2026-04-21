/**
 * Astro SSR ミドルウェア
 *
 * 全リクエストに対して以下を実行:
 * 1. CookieからSupabaseセッションを復元
 * 2. getUser() でJWTを検証し、必要に応じてトークンをリフレッシュ
 * 3. Astro.locals にクライアント・セッション・メンバー情報を注入
 * 4. 保護ルートへの未認証アクセスを /login へリダイレクト
 *
 * 【重要】
 * getSession() はCookieからJWTを読むだけで検証しない。
 * getUser() はSupabase Auth サーバーに問い合わせて JWT を検証し、
 * 期限切れであれば refresh_token で新しいトークンを取得 → Cookie書き換えを行う。
 * 永続セッションを実現するため、ミドルウェアでは必ず getUser() を使う。
 */
import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase';

/** 認証不要なパスのプレフィックス */
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/pre-check'];

export const onRequest = defineMiddleware(async ({ locals, cookies, request, redirect }, next) => {
  // 全リクエストでSupabaseサーバークライアントを生成
  const supabase = createSupabaseServerClient(cookies, request.headers);
  locals.supabase = supabase;
  locals.session = null;
  locals.member = null;

  const url = new URL(request.url);
  const isPublicPath = PUBLIC_PATHS.some((path) => url.pathname.startsWith(path));

  // ---------- JWT検証 & トークンリフレッシュ ----------
  // getUser() は:
  //   1. CookieからJWTを読む
  //   2. Supabase Auth サーバーで検証
  //   3. 期限切れなら refresh_token で更新し、setAll() で新Cookieをセット
  // つまりこの1回の呼び出しで「永続セッション」の維持が完結する。
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (user && !userError) {
    // JWT有効 → セッション情報も取得して locals に注入
    const { data: { session } } = await supabase.auth.getSession();
    locals.session = session;

    // メンバー情報を取得
    const { data: member } = await supabase
      .from('members')
      .select('id, email, name, role')
      .eq('email', user.email)
      .eq('status', 'active')
      .single();

    locals.member = member;

    // ログイン済みなのに /login にアクセスした場合は / にリダイレクト
    if (url.pathname === '/login') {
      return redirect('/');
    }
  } else if (!isPublicPath) {
    // 未認証 & 保護ルート → ログインへリダイレクト
    return redirect('/login');
  }

  return next();
});
