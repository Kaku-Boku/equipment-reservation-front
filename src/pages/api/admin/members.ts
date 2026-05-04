/**
 * ユーザー管理 API（管理者専用）
 *
 * GET:    メンバー一覧取得
 * POST:   メンバー追加
 * PUT:    ロール変更（admin / user）
 * DELETE: アカウント無効化 / 有効化（status: 'inactive' / 'active'）
 *
 * Note: ミドルウェアで /api/admin/* を管理者のみに制限しているが、
 *       防御的プログラミングとして各ルート内でも権限チェックを行う。
 */
import type { APIRoute } from 'astro';
import { JSON_HEADERS, checkAdmin, errorResponse } from '../../../lib/api-utils';
import { logger } from '../../../lib/logger';

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
    logger.error('[api/admin/members GET] エラー:', error);
    return errorResponse('メンバー一覧の取得に失敗しました。');
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

    const { data: newMember, error } = await supabase
      .from('members')
      .insert({ email, name, role, status: 'active' })
      .select('id, email, name, role, status, created_at')
      .single();

    if (error) {
      logger.error('[api/admin/members POST] エラー:', error);
      if (error.code === '23505') {
        return new Response(JSON.stringify({ error: 'このメールアドレスは既に登録されています。' }), { status: 400, headers: JSON_HEADERS });
      }
      return errorResponse('メンバーの登録に失敗しました。');
    }

    return new Response(JSON.stringify({ member: newMember }), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/admin/members POST] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
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
    if (id === member!.id) {
      return new Response(JSON.stringify({ error: '自分自身のロールは変更できません。' }), { status: 400, headers: JSON_HEADERS });
    }

    const { error } = await supabase.from('members').update({ role }).eq('id', id);
    if (error) {
      logger.error('[api/admin/members PUT] エラー:', error);
      return errorResponse('ロールの更新に失敗しました。');
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/admin/members PUT] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
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
    if (id === member!.id) {
      return new Response(JSON.stringify({ error: '自分自身のアカウントのステータスは変更できません。' }), { status: 400, headers: JSON_HEADERS });
    }

    const newStatus = restore ? 'active' : 'inactive';

    const { error } = await supabase.from('members').update({ status: newStatus }).eq('id', id);
    if (error) {
      logger.error('[api/admin/members DELETE] エラー:', error);
      return errorResponse('アカウントのステータス変更に失敗しました。');
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/admin/members DELETE] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
  }
};
