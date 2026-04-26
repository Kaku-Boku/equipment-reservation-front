/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { SupabaseClient, Session } from '@supabase/supabase-js';

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  /** Google OAuth Client ID（サーバーサイドのみ使用） */
  readonly GOOGLE_CLIENT_ID: string;
  /** Google OAuth Client Secret（サーバーサイドのみ使用） */
  readonly GOOGLE_CLIENT_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /** SSR用Supabaseクライアント（Cookieからセッション復元済み） */
    supabase: SupabaseClient;
    /** 現在のセッション情報 */
    session: Session | null;
    /** 現在ログイン中のメンバー情報 */
    member: {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user';
    } | null;
  }
}
