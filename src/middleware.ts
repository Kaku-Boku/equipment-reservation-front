/**
 * Astro SSR ミドルウェア
 *
 * 全リクエストに対して以下を実行:
 * 1. Cookie から Supabase セッションを復元
 * 2. getUser() で JWT を検証し、期限切れなら自動リフレッシュ
 * 3. Astro.locals にクライアント・セッション・メンバー情報を注入
 * 4. 保護ルートへの未認証アクセスを /login へリダイレクト
 *
 * 【重要】
 * getSession() は Cookie から JWT を読むだけで検証しない。
 * getUser() は Supabase Auth サーバーに問い合わせて JWT を検証し、
 * 期限切れであれば refresh_token で新しいトークンを取得 → Cookie 書き換えを行う。
 * 永続セッションを実現するため、ミドルウェアでは必ず getUser() を使う。
 */
import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase';
// @ts-ignore
import { env } from 'cloudflare:workers';

/** 認証不要なパスのプレフィックス一覧 */
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/pre-check'];

export const onRequest = defineMiddleware(async ({ locals, cookies, request, redirect }, next) => {
  // Cloudflare Pages のランタイム環境変数を取得
  let runtimeEnv = {};
  try {
    runtimeEnv = env || {};
  } catch (e) {
    // runtimeEnv access failed
  }

  // 全リクエストで Supabase サーバークライアントを生成
  const supabase = createSupabaseServerClient(cookies, request.headers, runtimeEnv);
  locals.supabase = supabase;
  locals.session = null;
  locals.member = null;

  const url = new URL(request.url);
  const isPublicPath = PUBLIC_PATHS.some((path) => url.pathname.startsWith(path));

  // ── JWT 検証 & トークンリフレッシュ ──
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (user && !userError) {
      // JWT 有効 → セッション情報を locals に注入
      const { data: { session } } = await supabase.auth.getSession();
      locals.session = session;

      // members テーブルからユーザー情報を取得
      const { data: member } = await supabase
        .from('members')
        .select('id, email, name, role')
        .eq('email', user.email)
        .eq('status', 'active')
        .single();

      locals.member = member;

      // ログイン済みで /login にアクセスした場合は / にリダイレクト
      if (url.pathname === '/login') {
        return redirect('/');
      }
    } else {
      if (!isPublicPath) {
        // 未認証 & 保護ルート → ログインページへリダイレクト
        return redirect('/login');
      }
    }
  } catch (err) {
    // ignore error
  }

  return next();
});
