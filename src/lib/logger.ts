/**
 * アプリケーションロガー
 *
 * Why: 開発中のデバッグ console.log が本番環境でも全て出力されており、
 *      Cloudflare Workers のログが汚染されていた。
 *      環境変数で出力を制御するラッパーを導入する。
 *
 * - debug: 開発環境（import.meta.env.DEV）のみ出力
 * - info / warn / error: 本番環境でも出力（重要な情報）
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /** 開発環境のみ出力（本番では無効） */
  debug: (...args: unknown[]): void => {
    if (isDev) console.log(...args);
  },
  /** 情報ログ（本番でも出力） */
  info: (...args: unknown[]): void => {
    console.log(...args);
  },
  /** 警告ログ（本番でも出力） */
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  /** エラーログ（本番でも出力） */
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
