/**
 * メンバー一覧取得API
 *
 * status='active' なメンバーのみ返却する（参加者選択用）。
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const { session, supabase } = locals;

  if (!session) {
    return new Response(
      JSON.stringify({ error: '認証が必要です。' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
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
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ members }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
