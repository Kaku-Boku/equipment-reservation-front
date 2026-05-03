/**
 * メールアドレス事前チェック API
 *
 * Google OAuth の未検証アプリ 100 名制限枠を無駄消費しないため、
 * OAuth 発火前にメアドが members テーブルに存在するかチェックする。
 *
 * レスポンス:
 * - ok: true  → 登録済み。クライアント側で OAuth を発火して良い
 * - ok: false → 未登録。エラーメッセージを表示する
 */
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';
// @ts-ignore
import { env } from 'cloudflare:workers';

/** JSON レスポンスの共通ヘッダー */
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** メールアドレスの基本バリデーション正規表現 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    const body = await request.json();
    const email = body?.email?.trim()?.toLowerCase();

    if (!email) {
      return new Response(
        JSON.stringify({ ok: false, message: 'メールアドレスを入力してください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return new Response(
        JSON.stringify({ ok: false, message: '有効なメールアドレスを入力してください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    const supabase = createSupabaseServerClient(cookies, request.headers, env);

    // members テーブルで active なメンバーかチェック
    const { data: member, error } = await supabase
      .from('members')
      .select('id, email, name')
      .eq('email', email)
      .eq('status', 'active')
      .single();

    if (error || !member) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: 'このメールアドレスは登録されていません。管理者にお問い合わせください。',
        }),
        { status: 200, headers: JSON_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, member: { name: member.name } }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    console.error('[api/pre-check] エラー:', err);
    return new Response(
      JSON.stringify({ ok: false, message: 'サーバーエラーが発生しました。' }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
};
