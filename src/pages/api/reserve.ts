/**
 * 予約CRUD APIルート
 *
 * - POST: 新規予約作成
 * - PUT: 予約更新
 * - DELETE: 予約削除
 *
 * DB側のEXCLUDE制約による時間重複エラーをハンドリングし、
 * クライアントに分かりやすいエラーメッセージを返す。
 */
import type { APIRoute } from 'astro';
import { syncWithGoogleCalendar } from '../../lib/google-calendar';

/**
 * EXCLUDE制約違反エラーかどうかを判定
 * PostgreSQLのexclusion violation: code 23P01
 */
function isExclusionViolation(error: any): boolean {
  return error?.code === '23P01' || error?.message?.includes('conflicting key value violates exclusion constraint');
}

/**
 * POST: 新規予約作成
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { session, member, supabase } = locals;

    if (!session || !member) {
      return new Response(
        JSON.stringify({ error: '認証が必要です。' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { facility_id, start_time, end_time, purpose, memo, notice, participant_ids } = body;

    // 入力バリデーション
    if (!facility_id || !start_time || !end_time || !purpose?.trim()) {
      return new Response(
        JSON.stringify({ error: '必須項目を入力してください（設備、開始時刻、終了時刻、利用目的）。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 開始 < 終了 チェック
    if (new Date(start_time) >= new Date(end_time)) {
      return new Response(
        JSON.stringify({ error: '終了時刻は開始時刻より後に設定してください。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 予約をINSERT
    const { data: reservation, error: insertError } = await supabase
      .from('reservations')
      .insert({
        facility_id,
        created_by: member.id,
        start_time,
        end_time,
        purpose: purpose.trim(),
        memo: memo?.trim() || null,
        notice: notice?.trim() || null,
      })
      .select('id')
      .single();

    if (insertError) {
      if (isExclusionViolation(insertError)) {
        return new Response(
          JSON.stringify({ error: 'この時間帯は既に予約されています。別の時間をお選びください。' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      console.error('[api/reserve POST] INSERT エラー:', insertError);
      return new Response(
        JSON.stringify({ error: '予約の作成に失敗しました。' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 参加者をINSERT（存在する場合）
    if (participant_ids && Array.isArray(participant_ids) && participant_ids.length > 0) {
      const participantRows = participant_ids.map((member_id: string) => ({
        reservation_id: reservation.id,
        member_id,
      }));

      const { error: participantError } = await supabase
        .from('reservation_participants')
        .insert(participantRows);

      if (participantError) {
        console.error('[api/reserve POST] 参加者INSERT エラー:', participantError);
        // 予約自体は成功しているので警告として扱う
      }
    }

    // Googleカレンダー同期（ダミー）
    const { data: facility } = await supabase
      .from('facilities')
      .select('name')
      .eq('id', facility_id)
      .single();

    await syncWithGoogleCalendar('create', {
      reservationId: reservation.id,
      facilityName: facility?.name || '',
      startTime: start_time,
      endTime: end_time,
      purpose,
      memo,
      notice,
      participants: participant_ids,
    });

    return new Response(
      JSON.stringify({ ok: true, reservation: { id: reservation.id } }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[api/reserve POST] 予期せぬエラー:', err);
    return new Response(
      JSON.stringify({ error: 'サーバーエラーが発生しました。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

/**
 * PUT: 予約更新
 */
export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const { session, member, supabase } = locals;

    if (!session || !member) {
      return new Response(
        JSON.stringify({ error: '認証が必要です。' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { id, facility_id, start_time, end_time, purpose, memo, notice, participant_ids } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: '予約IDが必要です。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 入力バリデーション
    if (!facility_id || !start_time || !end_time || !purpose?.trim()) {
      return new Response(
        JSON.stringify({ error: '必須項目を入力してください。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (new Date(start_time) >= new Date(end_time)) {
      return new Response(
        JSON.stringify({ error: '終了時刻は開始時刻より後に設定してください。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 既存予約を取得して権限チェック
    const { data: existing } = await supabase
      .from('reservations')
      .select('created_by')
      .eq('id', id)
      .single();

    if (!existing) {
      return new Response(
        JSON.stringify({ error: '予約が見つかりません。' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 自分の予約 or admin のみ編集可
    if (existing.created_by !== member.id && member.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'この予約を編集する権限がありません。' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 予約をUPDATE
    const { error: updateError } = await supabase
      .from('reservations')
      .update({
        facility_id,
        start_time,
        end_time,
        purpose: purpose.trim(),
        memo: memo?.trim() || null,
        notice: notice?.trim() || null,
      })
      .eq('id', id);

    if (updateError) {
      if (isExclusionViolation(updateError)) {
        return new Response(
          JSON.stringify({ error: 'この時間帯は既に予約されています。別の時間をお選びください。' }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        );
      }
      console.error('[api/reserve PUT] UPDATE エラー:', updateError);
      return new Response(
        JSON.stringify({ error: '予約の更新に失敗しました。' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 参加者を差し替え: DELETE → INSERT
    await supabase.from('reservation_participants').delete().eq('reservation_id', id);

    if (participant_ids && Array.isArray(participant_ids) && participant_ids.length > 0) {
      const participantRows = participant_ids.map((member_id: string) => ({
        reservation_id: id,
        member_id,
      }));

      const { error: participantError } = await supabase
        .from('reservation_participants')
        .insert(participantRows);

      if (participantError) {
        console.error('[api/reserve PUT] 参加者更新エラー:', participantError);
      }
    }

    // Googleカレンダー同期（ダミー）
    const { data: facility } = await supabase
      .from('facilities')
      .select('name')
      .eq('id', facility_id)
      .single();

    await syncWithGoogleCalendar('update', {
      reservationId: id,
      facilityName: facility?.name || '',
      startTime: start_time,
      endTime: end_time,
      purpose,
      memo,
      notice,
      participants: participant_ids,
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[api/reserve PUT] 予期せぬエラー:', err);
    return new Response(
      JSON.stringify({ error: 'サーバーエラーが発生しました。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

/**
 * DELETE: 予約削除
 */
export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { session, member, supabase } = locals;

    if (!session || !member) {
      return new Response(
        JSON.stringify({ error: '認証が必要です。' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return new Response(
        JSON.stringify({ error: '予約IDが必要です。' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 既存予約を取得して権限チェック
    const { data: existing } = await supabase
      .from('reservations')
      .select('created_by, facility_id, start_time, end_time, purpose')
      .eq('id', id)
      .single();

    if (!existing) {
      return new Response(
        JSON.stringify({ error: '予約が見つかりません。' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 自分の予約 or admin のみ削除可
    if (existing.created_by !== member.id && member.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'この予約を削除する権限がありません。' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 参加者を先に削除（外部キー制約）
    await supabase.from('reservation_participants').delete().eq('reservation_id', id);

    // 予約を削除
    const { error: deleteError } = await supabase
      .from('reservations')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[api/reserve DELETE] 削除エラー:', deleteError);
      return new Response(
        JSON.stringify({ error: '予約の削除に失敗しました。' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Googleカレンダー同期（ダミー）
    const { data: facility } = await supabase
      .from('facilities')
      .select('name')
      .eq('id', existing.facility_id)
      .single();

    await syncWithGoogleCalendar('delete', {
      reservationId: id,
      facilityName: facility?.name || '',
      startTime: existing.start_time,
      endTime: existing.end_time,
      purpose: existing.purpose,
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[api/reserve DELETE] 予期せぬエラー:', err);
    return new Response(
      JSON.stringify({ error: 'サーバーエラーが発生しました。' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
