/**
 * 設備一覧取得API
 *
 * status='active' な設備のみ返却する。
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

  const { data: facilities, error } = await supabase
    .from('facilities')
    .select('id, name, status')
    .eq('status', 'active')
    .order('name');

  if (error) {
    console.error('[api/facilities] 取得エラー:', error);
    return new Response(
      JSON.stringify({ error: '設備情報の取得に失敗しました。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ facilities }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
