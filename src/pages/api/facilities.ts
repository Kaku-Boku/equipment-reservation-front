/**
 * 設備管理 API
 *
 * GET:    設備一覧取得（全ユーザー可）
 * POST:   設備追加（管理者のみ）
 * PUT:    設備更新（管理者のみ）
 * DELETE: 設備を retired 状態に変更（管理者のみ）
 */
import type { APIRoute } from 'astro';
import { JSON_HEADERS, checkAdmin, errorResponse } from '../../lib/api-utils';
import { logger } from '../../lib/logger';

export const GET: APIRoute = async ({ locals }) => {
  const { session, member, supabase } = locals;

  if (!session || !member) {
    return new Response(JSON.stringify({ error: '認証が必要です。' }), { status: 401, headers: JSON_HEADERS });
  }

  const { data, error } = await supabase
    .from('facilities')
    .select('id, name, description, status, created_at')
    .order('name');

  if (error) {
    logger.error('[api/facilities GET] エラー:', error);
    return errorResponse('設備一覧の取得に失敗しました。');
  }

  return new Response(JSON.stringify({ facilities: data }), { status: 200, headers: JSON_HEADERS });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase } = locals;

  try {
    const body = await request.json() as any;
    const { name, description } = body;

    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: '設備名は必須です。' }), { status: 400, headers: JSON_HEADERS });
    }

    const { data, error } = await supabase
      .from('facilities')
      .insert({ name: name.trim(), description: description?.trim() || null, status: 'active' })
      .select('id, name, status')
      .single();

    if (error) {
      if (error.code === '23505') {
        return new Response(JSON.stringify({ error: 'この設備名は既に登録されています。' }), { status: 409, headers: JSON_HEADERS });
      }
      logger.error('[api/facilities POST] エラー:', error);
      return errorResponse('設備の追加に失敗しました。');
    }

    return new Response(JSON.stringify({ ok: true, facility: data }), { status: 201, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/facilities POST] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase } = locals;

  try {
    const body = await request.json() as any;
    const { id, name, description, status } = body;

    if (!id) return new Response(JSON.stringify({ error: '設備IDが必要です。' }), { status: 400, headers: JSON_HEADERS });
    if (!name?.trim()) return new Response(JSON.stringify({ error: '設備名は必須です。' }), { status: 400, headers: JSON_HEADERS });
    if (!['active', 'maintenance', 'retired'].includes(status)) {
      return new Response(JSON.stringify({ error: '無効なステータスです。' }), { status: 400, headers: JSON_HEADERS });
    }

    const { error } = await supabase
      .from('facilities')
      .update({ name: name.trim(), description: description?.trim() || null, status })
      .eq('id', id);

    if (error) {
      if (error.code === '23505') {
        return new Response(JSON.stringify({ error: 'この設備名は既に登録されています。' }), { status: 409, headers: JSON_HEADERS });
      }
      logger.error('[api/facilities PUT] エラー:', error);
      return errorResponse('設備の更新に失敗しました。');
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/facilities PUT] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const check = checkAdmin(locals);
  if (!check.ok) {
    return new Response(JSON.stringify({ error: check.message }), { status: check.status, headers: JSON_HEADERS });
  }

  const { supabase } = locals;

  try {
    const body = await request.json() as any;
    const { id } = body;

    if (!id) return new Response(JSON.stringify({ error: '設備IDが必要です。' }), { status: 400, headers: JSON_HEADERS });

    // 物理削除ではなく retired に変更（予約履歴を保持するため）
    const { error } = await supabase.from('facilities').update({ status: 'retired' }).eq('id', id);
    if (error) {
      logger.error('[api/facilities DELETE] エラー:', error);
      return errorResponse('設備の削除に失敗しました。');
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/facilities DELETE] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
  }
};
