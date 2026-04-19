/**
 * 予約CRUD APIルート
 *
 * - POST: 新規予約作成
 * - PUT: 予約更新
 * - DELETE: 予約削除
 *
 * DB側のEXCLUDE制約による時間重複エラーをハンドリングし、
 * クライアントに分かりやすいエラーメッセージを返す。
 *
 * Googleカレンダー同期を予約操作後に実行する。
 * 同期失敗は予約操作自体をブロックしない（警告のみ）。
 */
import type { APIRoute } from 'astro';
import { syncWithGoogleCalendar } from '../../lib/google-calendar';
import type { CalendarSyncData } from '../../lib/google-calendar';

/**
 * EXCLUDE制約違反エラーかどうかを判定
 * PostgreSQLのexclusion violation: code 23P01
 */
function isExclusionViolation(error: any): boolean {
  return error?.code === '23P01' || error?.message?.includes('conflicting key value violates exclusion constraint');
}

/**
 * 参加者IDリストからメールアドレスを取得
 */
async function getParticipantEmails(
  supabase: any,
  participantIds: string[]
): Promise<string[]> {
  if (!participantIds || participantIds.length === 0) return [];

  const { data } = await supabase
    .from('members')
    .select('email')
    .in('id', participantIds);

  return (data || []).map((m: any) => m.email);
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

    // Googleカレンダー同期
    const { data: facility } = await supabase
      .from('facilities')
      .select('name')
      .eq('id', facility_id)
      .single();

    const participantEmails = await getParticipantEmails(supabase, participant_ids || []);

    const syncData: CalendarSyncData = {
      reservationId: reservation.id,
      facilityName: facility?.name || '',
      startTime: start_time,
      endTime: end_time,
      purpose: purpose.trim(),
      memo: memo?.trim() || null,
      notice: notice?.trim() || null,
      participantEmails,
      creatorEmail: member.email,
    };

    // 同期は非同期で実行（失敗しても予約は成功扱い）
    const syncResult = await syncWithGoogleCalendar('create', syncData, supabase, member.id);
    if (!syncResult.synced) {
      console.warn('[api/reserve POST] カレンダー同期スキップ/失敗:', syncResult.error);
    }

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

    // 既存予約を取得して権限チェック（event_idも取得）
    const { data: existing } = await supabase
      .from('reservations')
      .select('created_by, event_id')
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

    // Googleカレンダー同期
    const { data: facility } = await supabase
      .from('facilities')
      .select('name')
      .eq('id', facility_id)
      .single();

    const participantEmails = await getParticipantEmails(supabase, participant_ids || []);

    const syncData: CalendarSyncData = {
      reservationId: id,
      eventId: existing.event_id, // 既存のGoogleカレンダーイベントID
      facilityName: facility?.name || '',
      startTime: start_time,
      endTime: end_time,
      purpose: purpose.trim(),
      memo: memo?.trim() || null,
      notice: notice?.trim() || null,
      participantEmails,
      creatorEmail: member.email,
    };

    const syncResult = await syncWithGoogleCalendar('update', syncData, supabase, existing.created_by);
    if (!syncResult.synced) {
      console.warn('[api/reserve PUT] カレンダー同期スキップ/失敗:', syncResult.error);
    }

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

    // 既存予約を取得して権限チェック（event_idも取得）
    const { data: existing } = await supabase
      .from('reservations')
      .select('created_by, facility_id, start_time, end_time, purpose, event_id')
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

    // Googleカレンダーから先に削除（予約削除後はevent_idが失われるため）
    const { data: facility } = await supabase
      .from('facilities')
      .select('name')
      .eq('id', existing.facility_id)
      .single();

    const syncData: CalendarSyncData = {
      reservationId: id,
      eventId: existing.event_id,
      facilityName: facility?.name || '',
      startTime: existing.start_time,
      endTime: existing.end_time,
      purpose: existing.purpose,
    };

    const syncResult = await syncWithGoogleCalendar('delete', syncData, supabase, existing.created_by);
    if (!syncResult.synced) {
      console.warn('[api/reserve DELETE] カレンダー同期スキップ/失敗:', syncResult.error);
    }

    // 参加者を先に削除（外部キー制約対応）
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
