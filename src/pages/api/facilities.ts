/**
 * 設備一覧取得 API
 *
 * status='active' な設備のみ返却する。
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

  const { data: facilities, error } = await supabase
    .from('facilities')
    .select('id, name, status')
    .eq('status', 'active')
    .order('name');

  if (error) {
    console.error('[api/facilities] 取得エラー:', error);
    return new Response(
      JSON.stringify({ error: '設備情報の取得に失敗しました。' }),
      { status: 500, headers: JSON_HEADERS }
    );
  }

  return new Response(
    JSON.stringify({ facilities }),
    { status: 200, headers: JSON_HEADERS }
  );
};
