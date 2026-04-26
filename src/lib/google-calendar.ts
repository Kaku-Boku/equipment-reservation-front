/**
 * Googleカレンダー連携モジュール（本実装）
 *
 * Cloudflare Workers互換のため、googleapis SDKではなく
 * Google Calendar REST API を fetch() で直接呼び出す。
 *
 * フロー:
 * 1. user_tokens テーブルから refresh_token を取得
 * 2. Google OAuth2 トークンエンドポイントで access_token を取得
 * 3. Google Calendar API v3 でイベント操作（作成/更新/削除）
 * 4. 作成時は reservations テーブルの event_id を更新
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// Google Calendar API ベースURL
const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** 環境変数を受け取るための型 */
export interface CalendarEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** カレンダー同期に必要なデータ */
export interface CalendarSyncData {
  reservationId: string;
  /** 既存のGoogle CalendarイベントID（更新・削除時に使用） */
  eventId?: string | null;
  facilityName: string;
  startTime: string;
  endTime: string;
  purpose: string;
  memo?: string | null;
  notice?: string | null;
  /** 参加者のメールアドレス一覧 */
  participantEmails?: string[];
  /** 予約作成者のメールアドレス */
  creatorEmail?: string;
}

/** カレンダー同期の結果 */
export interface CalendarSyncResult {
  eventId: string | null;
  synced: boolean;
  error?: string;
}

// ===========================================
//  内部ヘルパー関数
// ===========================================

/**
 * Google OAuth2 のクライアント認証情報が設定されているか確認
 */
function isGoogleCalendarConfigured(env: CalendarEnv): boolean {
  const clientId = env.GOOGLE_CLIENT_ID || import.meta.env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET || import.meta.env.GOOGLE_CLIENT_SECRET;
  return Boolean(clientId && clientSecret);
}

/**
 * refresh_token から access_token を取得
 */
async function getAccessToken(refreshToken: string, env: CalendarEnv): Promise<string | null> {
  const clientId = env.GOOGLE_CLIENT_ID || import.meta.env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET || import.meta.env.GOOGLE_CLIENT_SECRET;

  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[GoogleCalendar] トークン取得失敗:', response.status, errorBody);
      return null;
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  } catch (error) {
    console.error('[GoogleCalendar] トークン取得エラー:', error);
    return null;
  }
}

/**
 * user_tokens テーブルからユーザーの refresh_token を取得
 */
async function getRefreshToken(
  supabase: SupabaseClient,
  memberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_tokens')
    .select('refresh_token')
    .eq('member_id', memberId)
    .single();

  if (error || !data?.refresh_token) {
    console.warn('[GoogleCalendar] refresh_tokenが見つかりません (member_id:', memberId, ')');
    return null;
  }

  return data.refresh_token;
}

/**
 * Google Calendar API のイベント本体を構築
 */
function buildEventBody(data: CalendarSyncData): Record<string, any> {
  const event: Record<string, any> = {
    summary: `【${data.facilityName}】${data.purpose}`,
    start: {
      dateTime: data.startTime,
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: data.endTime,
      timeZone: 'Asia/Tokyo',
    },
  };

  // 説明文を構築
  const descriptionParts: string[] = [];
  descriptionParts.push(`設備: ${data.facilityName}`);
  descriptionParts.push(`目的: ${data.purpose}`);
  if (data.memo) descriptionParts.push(`\nメモ:\n${data.memo}`);
  if (data.notice) descriptionParts.push(`\n知らせたいこと:\n${data.notice}`);
  descriptionParts.push(`\n---\n※ 設備予約システムにより自動作成`);
  event.description = descriptionParts.join('\n');

  // 参加者（attendees）を追加
  if (data.participantEmails && data.participantEmails.length > 0) {
    event.attendees = data.participantEmails.map((email) => ({
      email,
      responseStatus: 'needsAction',
    }));
  }

  return event;
}

// ===========================================
//  Google Calendar API 呼び出し
// ===========================================

/**
 * カレンダーにイベントを作成
 */
async function createCalendarEvent(
  accessToken: string,
  data: CalendarSyncData
): Promise<string | null> {
  const response = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events?sendUpdates=all`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildEventBody(data)),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[GoogleCalendar] イベント作成失敗:', response.status, errorBody);
    return null;
  }

  const event = await response.json() as { id: string };
  return event.id;
}

/**
 * カレンダーのイベントを更新
 */
async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  data: CalendarSyncData
): Promise<boolean> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildEventBody(data)),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[GoogleCalendar] イベント更新失敗:', response.status, errorBody);
    return false;
  }

  return true;
}

/**
 * カレンダーのイベントを削除
 */
async function deleteCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<boolean> {
  const response = await fetch(
    `${CALENDAR_API_BASE}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  // 204 No Content = 成功、404 = 既に削除済み（どちらもOK）
  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    console.error('[GoogleCalendar] イベント削除失敗:', response.status, errorBody);
    return false;
  }

  return true;
}

// ===========================================
//  メインエクスポート関数
// ===========================================

/**
 * Googleカレンダーに予約イベントを同期する
 *
 * Google Calendar APIの環境変数が未設定の場合、または
 * ユーザーのrefresh_tokenが存在しない場合は、スキップして
 * { synced: false } を返す（予約自体は成功扱い）。
 *
 * @param action - 'create' | 'update' | 'delete'
 * @param data - イベントデータ
 * @param supabase - SSR用Supabaseクライアント
 * @param memberId - 予約作成者のメンバーID
 * @returns 同期結果（eventId, synced）
 */
export async function syncWithGoogleCalendar(
  action: 'create' | 'update' | 'delete',
  data: CalendarSyncData,
  supabase: SupabaseClient,
  memberId: string,
  env: CalendarEnv = {}
): Promise<CalendarSyncResult> {
  // Google Calendar 未設定の場合はスキップ
  if (!isGoogleCalendarConfigured(env)) {
    console.log('[GoogleCalendar] 環境変数未設定のためスキップ (action:', action, ')');
    return { eventId: data.eventId || null, synced: false };
  }

  try {
    // 1. ユーザーの refresh_token を取得
    const refreshToken = await getRefreshToken(supabase, memberId);
    if (!refreshToken) {
      return { eventId: data.eventId || null, synced: false, error: 'refresh_token未登録' };
    }

    // 2. access_token を取得
    const accessToken = await getAccessToken(refreshToken, env);
    if (!accessToken) {
      return { eventId: data.eventId || null, synced: false, error: 'access_token取得失敗' };
    }

    // 3. アクションに応じてAPI呼び出し
    switch (action) {
      case 'create': {
        const eventId = await createCalendarEvent(accessToken, data);
        if (eventId) {
          // 作成成功: reservations テーブルの event_id を更新
          await supabase
            .from('reservations')
            .update({ event_id: eventId })
            .eq('id', data.reservationId);

          console.log('[GoogleCalendar] イベント作成成功:', eventId);
          return { eventId, synced: true };
        }
        return { eventId: null, synced: false, error: 'イベント作成失敗' };
      }

      case 'update': {
        if (!data.eventId) {
          // event_idが無い場合は新規作成にフォールバック
          console.log('[GoogleCalendar] event_id未設定のため新規作成にフォールバック');
          const eventId = await createCalendarEvent(accessToken, data);
          if (eventId) {
            await supabase
              .from('reservations')
              .update({ event_id: eventId })
              .eq('id', data.reservationId);
            return { eventId, synced: true };
          }
          return { eventId: null, synced: false, error: 'フォールバック作成失敗' };
        }

        const updated = await updateCalendarEvent(accessToken, data.eventId, data);
        console.log('[GoogleCalendar] イベント更新:', updated ? '成功' : '失敗');
        return { eventId: data.eventId, synced: updated };
      }

      case 'delete': {
        if (!data.eventId) {
          console.log('[GoogleCalendar] event_id未設定のため削除スキップ');
          return { eventId: null, synced: false };
        }

        const deleted = await deleteCalendarEvent(accessToken, data.eventId);
        console.log('[GoogleCalendar] イベント削除:', deleted ? '成功' : '失敗');
        return { eventId: null, synced: deleted };
      }

      default:
        return { eventId: null, synced: false, error: `不明なアクション: ${action}` };
    }
  } catch (error) {
    console.error('[GoogleCalendar] 同期エラー:', error);
    return { eventId: data.eventId || null, synced: false, error: String(error) };
  }
}

// ===========================================
//  NOTE: トークンの保存処理について
// ===========================================
//
// provider_refresh_token の user_tokens テーブルへの保存は
// src/pages/auth/callback.ts 内で直接行っている。
//
// 理由: refresh_token は OAuth コールバック時にのみ取得可能であり、
//       その場で確実に永続化する必要があるため、責務をコールバックに集約した。
