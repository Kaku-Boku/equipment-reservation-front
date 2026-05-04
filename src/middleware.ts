/**
 * Astro SSR ミドルウェア
 *
 * 全リクエストに対して以下を実行:
 * 1. Cookie から Supabase セッションを復元
 * 2. getUser() で JWT を検証し、期限切れなら自動リフレッシュ
 * 3. Astro.locals にクライアント・セッション・メンバー情報を注入
 * 4. 保護ルートへの未認証アクセスを /login へリダイレクト
 * 5. /admin/* および /api/admin/* への非管理者アクセスを制限
 *
 * 【重要】
 * getSession() は Cookie から JWT を読むだけで検証しない。
 * getUser() は Supabase Auth サーバーに問い合わせて JWT を検証し、
 * 期限切れであれば refresh_token で新しいトークンを取得 → Cookie 書き換えを行う。
 * 永続セッションを実現するため、ミドルウェアでは必ず getUser() を使う。
 */
import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient } from './lib/supabase';
import { logger } from './lib/logger';

/**
 * 認証不要なパスのプレフィックス一覧
 * Why: startsWith を使うことで /login?redirect=... のようなクエリパラメータ付き
 *      アクセスや /auth/callback?code=xxx も正しくパブリックパスとして判定する。
 */
const PUBLIC_PATHS = [
  '/login',
  '/auth/callback',
  '/api/pre-check',
];

/**
 * 管理者のみアクセス可能なパスのプレフィックス一覧
 * Why: /api/admin/* も含めることで、ミドルウェアレベルで管理者 API を保護する。
 *      各 API ルートの個別チェックは防御的実装として残すが、二重ガードにより安全性を高める。
 */
const ADMIN_PATHS = ['/admin', '/api/admin'];

export const onRequest = defineMiddleware(async ({ locals, cookies, request, redirect }, next) => {
  logger.debug('[middleware] Request started:', request.url);

  // Why: createSupabaseServerClient は env を内部で直接インポートするため、引数渡し不要
  const supabase = createSupabaseServerClient(cookies, request.headers);
  locals.supabase = supabase;
  locals.session = null;
  locals.member = null;

  const url = new URL(request.url);
  const isPublicPath = PUBLIC_PATHS.some((path) => url.pathname.startsWith(path));
  logger.debug('[middleware] Path:', url.pathname, 'isPublic:', isPublicPath);

  // ── JWT 検証 & トークンリフレッシュ ──
  try {
    logger.debug('[middleware] Verifying JWT...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (user && !userError) {
      logger.debug('[middleware] User found:', user.email);
      const { data: { session } } = await supabase.auth.getSession();
      locals.session = session;

      const { data: member } = await supabase
        .from('members')
        .select('id, email, name, role')
        .eq('email', user.email)
        .eq('status', 'active')
        .single();

      locals.member = member;
      logger.debug('[middleware] Member loaded:', member?.name, 'role:', member?.role);

      if (url.pathname === '/login') {
        logger.debug('[middleware] Logged in user on /login, redirecting to /');
        return redirect('/');
      }

      // ── 管理者ルートの保護（ページ + API） ──
      const isAdminPath = ADMIN_PATHS.some((path) => url.pathname.startsWith(path));
      if (isAdminPath && member?.role !== 'admin') {
        logger.debug('[middleware] Non-admin accessing admin path, redirecting to /');
        // API パスの場合は 403 を返す（リダイレクトは不適切）
        if (url.pathname.startsWith('/api/')) {
          return new Response(
            JSON.stringify({ error: '管理者のみアクセスできます。' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return redirect('/');
      }
    } else {
      logger.debug('[middleware] No user or error:', userError?.message);
      if (!isPublicPath) {
        logger.debug('[middleware] Protected path, redirecting to /login');
        return redirect('/login');
      }
    }
  } catch (err) {
    logger.error('[middleware] Unexpected error:', err);
    // Why: 認証処理で例外発生時はリクエストを保護ルートに通過させない
    if (!isPublicPath) {
      return redirect('/login');
    }
  }

  logger.debug('[middleware] Proceeding to next...');
  return next();
});
