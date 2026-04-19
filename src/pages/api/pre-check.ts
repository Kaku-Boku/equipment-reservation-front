/**
 * メールアドレス事前チェックAPI
 *
 * Google OAuthの未検証アプリ100名制限枠を無駄消費しないため、
 * OAuth発火前にメアドが members テーブルに存在するかチェックする。
 */
import type { APIRoute } from 'astro';
import { createSupabaseServerClient } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const email = body?.email?.trim()?.toLowerCase();

    if (!email) {
      return new Response(
        JSON.stringify({ ok: false, message: 'メールアドレスを入力してください。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // メールアドレスの基本バリデーション
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ ok: false, message: '有効なメールアドレスを入力してください。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createSupabaseServerClient(cookies, request.headers);

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
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, member: { name: member.name } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[api/pre-check] エラー:', err);
    return new Response(
      JSON.stringify({ ok: false, message: 'サーバーエラーが発生しました。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
