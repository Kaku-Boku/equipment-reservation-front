/**
 * ユーザー管理 API（管理者専用）
 *
 * GET:    メンバー一覧取得
 * PUT:    ロール変更（admin / user）
 * DELETE: アカウント無効化（status: 'inactive'）
 */
import type { APIRoute } from 'astro';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** 管理者チェック共通処理 */
function checkAdmin(locals: any) {
  const { session, member } = locals;
  if (!session || !member) return { ok: false, status: 401, message: '認証が必要です。' };
  if (member.role !== 'admin') return { ok: false, status: 403, message: '管理者のみアクセスできます。' };
  return { ok: true };
}

export const GET: APIRoute = async ({ locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase } = locals;
  const { data, error } = await supabase
    .from('members')
    .select('id, email, name, role, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[api/admin/members GET] エラー:', error);
    return new Response(JSON.stringify({ error: 'メンバー一覧の取得に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ members: data }), { status: 200, headers: JSON_HEADERS });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase } = locals;

  try {
    const body = await request.json();
    const { email, name, role } = body;

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'メールアドレスと名前は必須です。' }), { status: 400, headers: JSON_HEADERS });
    }
    if (!['admin', 'user'].includes(role)) {
      return new Response(JSON.stringify({ error: 'role は "admin" または "user" を指定してください。' }), { status: 400, headers: JSON_HEADERS });
    }

    const { data: member, error } = await supabase
      .from('members')
      .insert({ email, name, role, status: 'active' })
      .select('id, email, name, role, status, created_at')
      .single();

    if (error) {
      console.error('[api/admin/members POST] エラー:', error);
      // 一意制約違反などの場合
      if (error.code === '23505') {
        return new Response(JSON.stringify({ error: 'このメールアドレスは既に登録されています。' }), { status: 400, headers: JSON_HEADERS });
      }
      return new Response(JSON.stringify({ error: 'メンバーの登録に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ member }), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[api/admin/members POST] 予期せぬエラー:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました。' }), { status: 500, headers: JSON_HEADERS });
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase, member } = locals;

  try {
    const body = await request.json();
    const { id, role } = body;

    if (!id) return new Response(JSON.stringify({ error: 'メンバーIDが必要です。' }), { status: 400, headers: JSON_HEADERS });
    if (!['admin', 'user'].includes(role)) {
      return new Response(JSON.stringify({ error: 'role は "admin" または "user" を指定してください。' }), { status: 400, headers: JSON_HEADERS });
    }
    // 自分自身の権限変更は禁止
    if (id === member.id) {
      return new Response(JSON.stringify({ error: '自分自身のロールは変更できません。' }), { status: 400, headers: JSON_HEADERS });
    }

    const { error } = await supabase.from('members').update({ role }).eq('id', id);
    if (error) {
      console.error('[api/admin/members PUT] エラー:', error);
      return new Response(JSON.stringify({ error: 'ロールの更新に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[api/admin/members PUT] 予期せぬエラー:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました。' }), { status: 500, headers: JSON_HEADERS });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase, member } = locals;

  try {
    const body = await request.json();
    const { id, restore } = body;

    if (!id) return new Response(JSON.stringify({ error: 'メンバーIDが必要です。' }), { status: 400, headers: JSON_HEADERS });
    if (id === member.id) {
      return new Response(JSON.stringify({ error: '自分自身のアカウントのステータスは変更できません。' }), { status: 400, headers: JSON_HEADERS });
    }

    const newStatus = restore ? 'active' : 'inactive';

    const { error } = await supabase.from('members').update({ status: newStatus }).eq('id', id);
    if (error) {
      console.error('[api/admin/members DELETE] エラー:', error);
      return new Response(JSON.stringify({ error: 'アカウントのステータス変更に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[api/admin/members DELETE] 予期せぬエラー:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました。' }), { status: 500, headers: JSON_HEADERS });
  }
};
