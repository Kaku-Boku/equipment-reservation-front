/**
 * Supabase クライアントユーティリティ
 *
 * SSR 用とクライアントサイド用の 2 つのエクスポートを提供:
 *
 * - createSupabaseServerClient: Astro SSR ミドルウェア / API ルートで使用。
 *   Astro の Cookies API と連携してセッション Cookie の読み書きを行う。
 *   env は cloudflare:workers から直接インポートするため、引数渡し不要。
 *
 * - SUPABASE_CONFIG: ブラウザ側で createClient() に渡す設定値。
 *   HTML にインライン出力して Preact コンポーネントから参照する。
 */
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';
import { env } from 'cloudflare:workers';
import { logger } from './logger';

/**
 * SSR 用 Supabase クライアントを生成する
 *
 * Why: _runtimeEnv パラメータを受け取っていたが、内部では使用せず
 *      cloudflare:workers から直接 env をインポートしていた。
 *      不要な引数を削除し、シグネチャを明確にする。
 *
 * @param cookies - Astro の Cookies API インスタンス
 * @param headers - リクエストヘッダー（Cookie 文字列の取得に使用）
 * @returns 認証セッション付きの Supabase クライアント
 */
export function createSupabaseServerClient(
  cookies: AstroCookies,
  headers: Headers,
) {
  const supabaseUrl = env?.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const supabaseKey = env?.PUBLIC_SUPABASE_PUBLISHABLE_KEY || import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  logger.debug('[supabase.ts] Creating server client:', {
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabaseKey),
    urlSource: env?.PUBLIC_SUPABASE_URL ? 'cloudflare:workers env' : 'import.meta.env',
  });

  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          // リクエストヘッダーの Cookie 文字列を { name, value }[] にパース
          return parseCookieHeader(headers.get('Cookie') ?? '');
        },
        setAll(cookiesToSet) {
          // セッション更新時: 各 Cookie を Astro の cookies.set() でレスポンスに付与
          cookiesToSet.forEach(({ name, value, options }) => {
            cookies.set(name, value, {
              path: '/',
              ...options,
            });
          });
        },
      },
    }
  );
}

/**
 * クライアントサイド用の Supabase 接続設定
 *
 * ブラウザでは import.meta.env が使えないため、
 * Layout.astro で `<script define:vars>` を通じてグローバルに公開する。
 */
export const SUPABASE_CONFIG = {
  url: import.meta.env.PUBLIC_SUPABASE_URL,
  anonKey: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

/**
 * サーバーサイド管理者用 Supabase クライアント（Service Role Key 使用）
 *
 * RLS をバイパスし、app_secrets 等の機密データにアクセスするために使用。
 * ⚠️ このクライアントはサーバーサイドのみで使用し、クライアントに渡さないこと。
 * 環境変数: SUPABASE_SERVICE_ROLE_KEY（Cloudflare Bindings / .env に設定）
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = env?.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env?.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    logger.warn(
      '[supabase.ts] SUPABASE_SERVICE_ROLE_KEY が未設定です。' +
      'app_secrets へのアクセスは失敗します。' +
      '（Supabase ダッシュボード > API > Secret keys で取得してください）'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey || '');
}
