/**
 * 予約承認/却下 API
 *
 * PUT: 管理者のみ予約ステータスを 'approved' または 'rejected' に更新する。
 *      承認（approved）時は Google カレンダーへの同期も実行する。
 *
 * リクエストボディ:
 * - id:     予約 ID（必須）
 * - status: 'approved' | 'rejected'（必須）
 */
import type { APIRoute } from 'astro';
import { JSON_HEADERS, errorResponse } from '../../lib/api-utils';
import { logger } from '../../lib/logger';
import { syncWithGoogleCalendar, syncSharedCalendar } from '../../lib/google-calendar';
import { createSupabaseAdminClient } from '../../lib/supabase';
import { env } from 'cloudflare:workers';


export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    const { session, member, supabase } = locals;

    if (!session || !member) {
      return errorResponse('認証が必要です。', 401);
    }

    if (member.role !== 'admin') {
      return errorResponse('管理者のみ実行できます。', 403);
    }

    const body = await request.json() as any;
    const { id, status } = body;

    if (!id) {
      return errorResponse('予約IDが必要です。', 400);
    }

    if (!['approved', 'rejected'].includes(status)) {
      return errorResponse('status は "approved" または "rejected" を指定してください。', 400);
    }

    // 予約の存在確認（カレンダー同期に必要な詳細データも取得）
    const { data: existing } = await supabase
      .from('reservations')
      .select('id, status, created_by, start_time, end_time, purpose, memo, notice, event_id, shared_event_id, facility_id')
      .eq('id', id)
      .single();

    if (!existing) {
      return errorResponse('予約が見つかりません。', 404);
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
      logger.error('[api/approve PUT] UPDATE エラー:', updateError);
      return errorResponse('ステータスの更新に失敗しました。');
    }

    const actionText = status === 'approved' ? '承認' : '却下';
    logger.info(`[api/approve PUT] 予約 ${id} を ${actionText} しました（by ${member!.email}）`);

    // ── 承認時: Google カレンダーへの同期 ──
    // Why: auto_approve=false の場合、予約は pending で作成される。
    //      管理者が承認した時点で初めてカレンダーに反映する。
    if (status === 'approved') {
      try {
        // 設備名と作成者メールを取得
        const [{ data: facilityData }, { data: creatorData }] = await Promise.all([
          supabase.from('facilities').select('name').eq('id', existing.facility_id).single(),
          supabase.from('members').select('email').eq('id', existing.created_by).single(),
        ]);

        const syncData = {
          reservationId: id,
          facilityName: facilityData?.name || '',
          startTime: existing.start_time,
          endTime: existing.end_time,
          purpose: existing.purpose,
          memo: existing.memo || '',
          notice: existing.notice || '',
          creatorEmail: creatorData?.email,
        };

        // 個人カレンダー同期
        const personalSync = await syncWithGoogleCalendar('create', syncData, supabase, existing.created_by, env);
        if (!personalSync.synced) {
          logger.warn('[api/approve PUT] 個人カレンダー同期スキップ:', personalSync.error);
        }

        // 共有カレンダー同期
        const { data: settings } = await supabase
          .from('app_settings')
          .select('shared_calendar_enabled')
          .single();

        if (settings?.shared_calendar_enabled) {
          const adminClient = createSupabaseAdminClient();
          const sharedSync = await syncSharedCalendar('create', syncData, adminClient, env);
          if (sharedSync.eventId) {
            await supabase
              .from('reservations')
              .update({ shared_event_id: sharedSync.eventId })
              .eq('id', id);
          }
        }
      } catch (syncErr) {
        // カレンダー同期の失敗は承認成功には影響しない（ベストエフォート）
        logger.error('[api/approve PUT] カレンダー同期エラー（承認は完了）:', syncErr);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, status }),
      { status: 200, headers: JSON_HEADERS }
    );
  } catch (err) {
    logger.error('[api/approve PUT] 予期せぬエラー:', err);
    return errorResponse('サーバーエラーが発生しました。');
  }
};
