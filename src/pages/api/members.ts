/**
 * メンバー一覧取得 API
 *
 * status='active' なメンバーのみ返却する（参加者選択用）。
 */
import type { APIRoute } from 'astro';

/** JSON レスポンスの共通ヘッダー */
const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const GET: APIRoute = async ({ locals }) => {
  const { session, supabase } = locals;

  if (!session) {
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
    console.error('[api/members] 取得エラー:', error);
    return new Response(
      JSON.stringify({ error: 'メンバー情報の取得に失敗しました。' }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  return new Response(
    JSON.stringify({ members }),
    { status: 200, headers: JSON_HEADERS }
  );
};
