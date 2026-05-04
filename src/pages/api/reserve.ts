/**
 * 予約 CRUD API ルート
 *
 * - POST:   新規予約作成
 * - PUT:    予約更新
 * - DELETE: 予約削除
 *
 * app_settings からバリデーションルール（最小単位・最大時間・自動承認）を取得し、
 * フロントと同じ制約をバックエンドでも強制する。
 * auto_approve = false の場合、status を 'pending' として INSERT する。
 *
 * shared_calendar_enabled = true の場合、個人カレンダーに加えて
 * 共有カレンダーへも同期する。
 *
 * DB 側の EXCLUDE 制約による時間重複エラーをハンドリングし、
 * クライアントに分かりやすいエラーメッセージを返す。
 */
import type { APIRoute } from 'astro';
import { syncWithGoogleCalendar, syncSharedCalendar } from '../../lib/google-calendar';
import type { CalendarSyncData } from '../../lib/google-calendar';
import { createSupabaseAdminClient } from '../../lib/supabase';
import { DEFAULT_APP_SETTINGS } from '../../lib/types';
import { JSON_HEADERS } from '../../lib/api-utils';
import { logger } from '../../lib/logger';
import { env } from 'cloudflare:workers';
import { validateIsoDuration, isExclusionViolation, isTimeLockError } from '../../utils/reservation-utils';


async function getParticipantEmails(supabase: any, participantIds: string[]): Promise<string[]> {
  if (!participantIds || participantIds.length === 0) return [];
  const { data } = await supabase.from('members').select('email').in('id', participantIds);
  return (data || []).map((m: any) => m.email);
}

/** app_settings を取得（失敗時はデフォルト値） */
async function getAppSettings(supabase: any) {
  const { data } = await supabase.from('app_settings').select('*').single();
  return data || DEFAULT_APP_SETTINGS;
}

// =========================================
// POST: 新規予約作成
// =========================================
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { session, member, supabase } = locals;
    if (!session || !member) {
      return new Response(JSON.stringify({ error: '認証が必要です。' }), { status: 401, headers: JSON_HEADERS });
    }

    const body = await request.json() as any;
    const { facility_id, start_time, end_time, purpose, memo, notice, participant_ids } = body;

    if (!facility_id || !start_time || !end_time || !purpose?.trim()) {
      return new Response(
        JSON.stringify({ error: '必須項目を入力してください（設備、開始時刻、終了時刻、利用目的）。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }
    if (new Date(start_time) >= new Date(end_time)) {
      return new Response(
        JSON.stringify({ error: '終了時刻は開始時刻より後に設定してください。' }),
        { status: 400, headers: JSON_HEADERS }
      );
    }

    // app_settings によるバリデーション
    const settings = await getAppSettings(supabase);
    const durationError = validateIsoDuration(
      start_time, end_time,
      settings.min_reservation_minutes,
      settings.max_reservation_hours
    );
    if (durationError) {
      return new Response(JSON.stringify({ error: durationError }), { status: 400, headers: JSON_HEADERS });
    }

    // 予約可能日数チェック（管理者は除外）
    if (member!.role !== 'admin' && settings.reservation_lead_time_days > 0) {
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + settings.reservation_lead_time_days);
      if (new Date(start_time) > maxDate) {
        return new Response(
          JSON.stringify({ error: `予約できるのは本日から ${settings.reservation_lead_time_days} 日以内です。` }),
          { status: 400, headers: JSON_HEADERS }
        );
      }
    }

    // auto_approve に基づく status 決定
    const status = settings.auto_approve ? 'approved' : 'pending';

    const { data: reservation, error: insertError } = await supabase
      .from('reservations')
      .insert({
        facility_id,
        created_by: member!.id,
        start_time,
        end_time,
        purpose: purpose.trim(),
        memo: memo?.trim() || null,
        notice: notice?.trim() || null,
        status,
      })
      .select('id')
      .single();

    if (insertError) {
      if (isExclusionViolation(insertError)) {
        return new Response(
          JSON.stringify({ error: 'この時間帯は既に予約されています。別の時間をお選びください。' }),
          { status: 409, headers: JSON_HEADERS }
        );
      }
      logger.error('[api/reserve POST] INSERT エラー:', insertError);
      return new Response(JSON.stringify({ error: '予約の作成に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
    }


    // 参加者を INSERT
    if (participant_ids?.length > 0) {
      const { error: participantError } = await supabase
        .from('reservation_participants')
        .insert(participant_ids.map((member_id: string) => ({ reservation_id: reservation.id, member_id })));
      if (participantError) logger.error('[api/reserve POST] 参加者 INSERT エラー:', participantError);
    }


    // Google カレンダー同期（approved の場合のみ）
    if (status === 'approved') {
      const { data: facility } = await supabase.from('facilities').select('name').eq('id', facility_id).single();
      const participantEmails = await getParticipantEmails(supabase, participant_ids || []);
      const syncData: CalendarSyncData = {
        reservationId: reservation.id,
        facilityName: facility?.name || '',
        startTime: start_time, endTime: end_time,
        purpose: purpose.trim(), memo: memo?.trim() || null, notice: notice?.trim() || null,
        participantEmails, creatorEmail: member.email,
      };

      const syncResult = await syncWithGoogleCalendar('create', syncData, supabase, member.id, env);
      if (!syncResult.synced) logger.warn('[api/reserve POST] 個人カレンダー同期スキップ:', syncResult.error);

      // 共有カレンダー同期
      if (settings.shared_calendar_enabled) {
        const adminClient = createSupabaseAdminClient();
        const sharedResult = await syncSharedCalendar('create', syncData, adminClient, env);
        if (!sharedResult.synced) console.warn('[api/reserve POST] 共有カレンダー同期スキップ:', sharedResult.error);
        else if (sharedResult.eventId) {
          await supabase.from('reservations').update({ shared_event_id: sharedResult.eventId }).eq('id', reservation.id);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, reservation: { id: reservation.id }, status }),
      { status: 201, headers: JSON_HEADERS }
    );
  } catch (err) {
    console.error('[api/reserve POST] 予期せぬエラー:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました。' }), { status: 500, headers: JSON_HEADERS });
  }
};

// =========================================
// PUT: 予約更新
// =========================================
export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const { session, member, supabase } = locals;
    if (!session || !member) {
      return new Response(JSON.stringify({ error: '認証が必要です。' }), { status: 401, headers: JSON_HEADERS });
    }

    const body = await request.json() as any;
    const { id, facility_id, start_time, end_time, purpose, memo, notice, participant_ids } = body;

    if (!id) return new Response(JSON.stringify({ error: '予約IDが必要です。' }), { status: 400, headers: JSON_HEADERS });
    if (!facility_id || !start_time || !end_time || !purpose?.trim()) {
      return new Response(JSON.stringify({ error: '必須項目を入力してください。' }), { status: 400, headers: JSON_HEADERS });
    }
    if (new Date(start_time) >= new Date(end_time)) {
      return new Response(JSON.stringify({ error: '終了時刻は開始時刻より後に設定してください。' }), { status: 400, headers: JSON_HEADERS });
    }

    const settings = await getAppSettings(supabase);
    const durationError = validateIsoDuration(start_time, end_time, settings.min_reservation_minutes, settings.max_reservation_hours);
    if (durationError) return new Response(JSON.stringify({ error: durationError }), { status: 400, headers: JSON_HEADERS });

    const { data: existing } = await supabase
      .from('reservations')
      .select('created_by, event_id, shared_event_id')
      .eq('id', id)
      .single();

    if (!existing) return new Response(JSON.stringify({ error: '予約が見つかりません。' }), { status: 404, headers: JSON_HEADERS });
    if (existing.created_by !== member!.id && member!.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'この予約を編集する権限がありません。' }), { status: 403, headers: JSON_HEADERS });
    }

    const { error: updateError } = await supabase
      .from('reservations')
      .update({ facility_id, start_time, end_time, purpose: purpose.trim(), memo: memo?.trim() || null, notice: notice?.trim() || null })
      .eq('id', id);

    if (updateError) {
      if (isExclusionViolation(updateError)) {
        return new Response(JSON.stringify({ error: 'この時間帯は既に予約されています。別の時間をお選びください。' }), { status: 409, headers: JSON_HEADERS });
      }
      if (isTimeLockError(updateError)) {
        return new Response(JSON.stringify({ error: updateError.message }), { status: 409, headers: JSON_HEADERS });
      }
      console.error('[api/reserve PUT] UPDATE エラー:', updateError);
      return new Response(JSON.stringify({ error: '予約の更新に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
    }

    // 参加者を差し替え
    await supabase.from('reservation_participants').delete().eq('reservation_id', id);
    if (participant_ids?.length > 0) {
      const { error: participantError } = await supabase
        .from('reservation_participants')
        .insert(participant_ids.map((member_id: string) => ({ reservation_id: id, member_id })));
      if (participantError) console.error('[api/reserve PUT] 参加者更新エラー:', participantError);
    }

    // Google カレンダー同期
    const { data: facility } = await supabase.from('facilities').select('name').eq('id', facility_id).single();
    const participantEmails = await getParticipantEmails(supabase, participant_ids || []);
    const syncData: CalendarSyncData = {
      reservationId: id, eventId: existing.event_id,
      facilityName: facility?.name || '',
      startTime: start_time, endTime: end_time,
      purpose: purpose.trim(), memo: memo?.trim() || null, notice: notice?.trim() || null,
      participantEmails, creatorEmail: member!.email,
    };

    const syncResult = await syncWithGoogleCalendar('update', syncData, supabase, existing.created_by, env);
    if (!syncResult.synced) console.warn('[api/reserve PUT] 個人カレンダー同期スキップ:', syncResult.error);

    if (settings.shared_calendar_enabled && existing.shared_event_id) {
      const adminClient = createSupabaseAdminClient();
      await syncSharedCalendar('update', { ...syncData, eventId: existing.shared_event_id }, adminClient, env);
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    console.error('[api/reserve PUT] 予期せぬエラー:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました。' }), { status: 500, headers: JSON_HEADERS });
  }
};

// =========================================
// DELETE: 予約削除
// =========================================
export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { session, member, supabase } = locals;
    if (!session || !member) {
      return new Response(JSON.stringify({ error: '認証が必要です。' }), { status: 401, headers: JSON_HEADERS });
    }

    const body = await request.json() as any;
    const { id } = body;
    if (!id) return new Response(JSON.stringify({ error: '予約IDが必要です。' }), { status: 400, headers: JSON_HEADERS });

    const { data: existing } = await supabase
      .from('reservations')
      .select('created_by, facility_id, start_time, end_time, purpose, event_id, shared_event_id')
      .eq('id', id)
      .single();

    if (!existing) return new Response(JSON.stringify({ error: '予約が見つかりません。' }), { status: 404, headers: JSON_HEADERS });
    if (existing.created_by !== member!.id && member!.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'この予約を削除する権限がありません。' }), { status: 403, headers: JSON_HEADERS });
    }

    const { data: facility } = await supabase.from('facilities').select('name').eq('id', existing.facility_id).single();
    const syncData: CalendarSyncData = {
      reservationId: id, eventId: existing.event_id,
      facilityName: facility?.name || '',
      startTime: existing.start_time, endTime: existing.end_time, purpose: existing.purpose,
    };

    // Why: DB 削除を先に行い、成功した場合のみカレンダーを削除する。
    // 逆順序は、DB 削除がトリガーの時間ロックで失敗した場合に
    // カレンダーイベントだけ削除されてデータ不整合が生じるリスクがある。
    await supabase.from('reservation_participants').delete().eq('reservation_id', id);

    const { error: deleteError } = await supabase.from('reservations').delete().eq('id', id);
    if (deleteError) {
      if (isTimeLockError(deleteError)) {
        return new Response(JSON.stringify({ error: deleteError.message }), { status: 409, headers: JSON_HEADERS });
      }
      logger.error('[api/reserve DELETE] 削除エラー:', deleteError);
      return new Response(JSON.stringify({ error: '予約の削除に失敗しました。' }), { status: 500, headers: JSON_HEADERS });
    }

    // DB 削除成功後にカレンダー削除（失敗しても DB は正しい状態）
    const syncResult = await syncWithGoogleCalendar('delete', syncData, supabase, existing.created_by, env);
    if (!syncResult.synced) logger.warn('[api/reserve DELETE] 個人カレンダー同期スキップ:', syncResult.error);

    // 共有カレンダーからも削除
    if (existing.shared_event_id) {
      const adminClient = createSupabaseAdminClient();
      const settings = await getAppSettings(supabase);
      if (settings.shared_calendar_enabled) {
        await syncSharedCalendar('delete', { ...syncData, eventId: existing.shared_event_id }, adminClient, env);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  } catch (err) {
    logger.error('[api/reserve DELETE] 予期せぬエラー:', err);
    return new Response(JSON.stringify({ error: 'サーバーエラーが発生しました。' }), { status: 500, headers: JSON_HEADERS });
  }
};

