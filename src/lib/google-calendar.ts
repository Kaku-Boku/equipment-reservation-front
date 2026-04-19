/**
 * Googleカレンダー連携ダミーモジュール
 *
 * 将来的にGoogle Calendar APIと連携して予約をカレンダーに同期する。
 * 現段階ではモック関数として実装し、コンソールにログを出力するのみ。
 */

interface CalendarEventData {
  reservationId: string;
  facilityName: string;
  startTime: string;
  endTime: string;
  purpose: string;
  memo?: string;
  notice?: string;
  participants?: string[];
}

/**
 * Googleカレンダーに予約イベントを同期する（ダミー実装）
 *
 * @param action - 'create' | 'update' | 'delete'
 * @param data - イベントデータ
 * @returns ダミーのイベントID
 */
export async function syncWithGoogleCalendar(
  action: 'create' | 'update' | 'delete',
  data: CalendarEventData
): Promise<{ eventId: string | null; synced: boolean }> {
  // TODO: 本番実装時は以下の処理を行う
  // 1. user_tokens テーブルから refresh_token を取得
  // 2. Google OAuth2 で access_token を取得
  // 3. Google Calendar API でイベント作成/更新/削除
  console.log(`[GoogleCalendar Mock] Action: ${action}`, JSON.stringify(data, null, 2));

  return {
    eventId: `mock-event-${Date.now()}`,
    synced: false, // モック実装のためfalse
  };
}
