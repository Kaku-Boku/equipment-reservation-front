/**
 * 共通型定義
 *
 * app_settings / Member / Facility など複数のコンポーネント・APIルートで
 * 共有する型をここに集約する。
 */

/** アプリケーション設定（app_settings テーブル） */
export interface AppSettings {
  id: number;
  start_hour: number;
  end_hour: number;
  /** 予約可能日数（今日から何日後まで予約できるか） */
  reservation_lead_time_days: number;
  max_reservation_hours: number;
  min_reservation_minutes: number;
  /** true = 予約確定時に即 approved / false = pending として保留 */
  auto_approve: boolean;
  shared_calendar_enabled: boolean;
  shared_calendar_email: string | null;
  updated_at: string;
}

/** フェッチ失敗時のデフォルト設定値 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 1,
  start_hour: 8,
  end_hour: 20,
  reservation_lead_time_days: 90,
  max_reservation_hours: 8,
  min_reservation_minutes: 10,
  auto_approve: true,
  shared_calendar_enabled: false,
  shared_calendar_email: null,
  updated_at: '',
};

/** メンバー情報 */
export interface Member {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

/** 設備情報（status を含む完全版） */
export interface Facility {
  id: string;
  name: string;
  status: 'active' | 'maintenance' | 'retired';
}
