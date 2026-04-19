/**
 * Supabase クライアントユーティリティ
 *
 * - createSupabaseServerClient: SSR用（AstroのCookies APIと連携してセッション管理）
 * - BROWSER_SUPABASE_CONFIG: クライアントサイドでcreateClient()に渡す設定
 */
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

/**
 * SSR用Supabaseクライアントを生成
 * AstroのCookies APIを使ってセッションCookieの読み書きを行う
 */
export function createSupabaseServerClient(cookies: AstroCookies, headers: Headers) {
  return createServerClient(
    import.meta.env.PUBLIC_SUPABASE_URL,
    import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          // Astro の cookies.get() ではなく、リクエストヘッダーの Cookie 文字列をパースして
          // @supabase/ssr が期待する { name, value }[] 形式に変換する
          return parseCookieHeader(headers.get('Cookie') ?? '');
        },
        setAll(cookiesToSet) {
          // セッション更新時に呼ばれる: 各Cookieを Astro の cookies.set() でレスポンスに付与
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
 * クライアントサイド用のSupabase設定値
 * ブラウザ側では import.meta.env が使えないため、HTMLにインライン出力するための定数
 */
export const SUPABASE_CONFIG = {
  url: import.meta.env.PUBLIC_SUPABASE_URL,
  anonKey: import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};
