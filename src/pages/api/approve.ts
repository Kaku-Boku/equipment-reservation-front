/**
 * 予約承認/却下 API
 *
 * PUT: 管理者のみ予約ステータスを 'approved' または 'rejected' に更新する。
 *
 * リクエストボディ:
 * - id:     予約 ID（必須）
 * - status: 'approved' | 'rejected'（必須）
 */
import type { APIRoute } from 'astro';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const { session, member, supabase } = locals;

    if (!session || !member) {
      return new Response(
        JSON.stringify({ error: '認証が必要です。' }),
        { status: 401, headers: JSON_HEADERS }
      );
    }

    if (member.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: '管理者のみ実行できます。' }),
        { status: 403, headers: JSON_HEADERS }
      );
    }

    const body = await request.json();
    const { id, status } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: '予約IDが必要です。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    if (!['approved', 'rejected'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'status は "approved" または "rejected" を指定してください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // 予約の存在確認
    const { data: existing } = await supabase
      .from('reservations')
      .select('id, status')
      .eq('id', id)
      .single();

    if (!existing) {
      return new Response(
        JSON.stringify({ error: '予約が見つかりません。' }),
        { status: 404, headers: JSON_HEADERS }
      );
    }

    if (existing.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: `この予約は既に「${existing.status}」状態です。` }),
        { status: 409, headers: JSON_HEADERS }
      );
    }

    // ステータスを更新
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ status })
      .eq('id', id);

    if (updateError) {
      console.error('[api/approve PUT] UPDATE エラー:', updateError);
      return new Response(
        JSON.stringify({ error: 'ステータスの更新に失敗しました。' }),
        { status: 500, headers: JSON_HEADERS }
      );
    }

    const actionText = status === 'approved' ? '承認' : '却下';
    console.log(`[api/approve PUT] 予約 ${id} を ${actionText} しました（by ${member.email}）`);

    return new Response(
      JSON.stringify({ ok: true, status }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    console.error('[api/approve PUT] 予期せぬエラー:', err);
    return new Response(
      JSON.stringify({ error: 'サーバーエラーが発生しました。' }),
      { status: 500, headers: JSON_HEADERS }
    );
  }
};
