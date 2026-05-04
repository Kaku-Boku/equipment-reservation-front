/**
 * メンバー一覧取得 API
 *
 * status='active' なメンバーのみ返却する（参加者選択用）。
 */
import type { APIRoute } from 'astro';
import { JSON_HEADERS, errorResponse } from '../../lib/api-utils';
import { logger } from '../../lib/logger';

export const GET: APIRoute = async ({ locals }) => {
  // Why: session のみでなく member もチェックする
  //      inactive なユーザーや未登録ユーザーはアクセス不可
  const { session, member, supabase } = locals;

  if (!session || !member) {
    return new Response(
      JSON.stringify({ error: '認証が必要です。' }),
      { status: 401, headers: JSON_HEADERS }
    );
  }

  const { data: members, error } = await supabase
    .from('members')
    .select('id, email, name, role')
    .eq('status', 'active')
    .order('name');

  if (error) {
    logger.error('[api/members] 取得エラー:', error);
    return errorResponse('メンバー情報の取得に失敗しました。');
  }

  return new Response(
    JSON.stringify({ members }),
    { status: 200, headers: JSON_HEADERS }
  );
};
