/**
 * API ルート共通ユーティリティ
 *
 * 全 API ルートで重複していた以下の定義を一元化する:
 * - JSON_HEADERS: Content-Type ヘッダー
 * - jsonResponse / errorResponse: レスポンス生成ヘルパー
 * - checkAdmin: 管理者権限チェック
 */

/** JSON レスポンスの共通ヘッダー */
export const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/**
 * JSON レスポンスを生成する
 * @param body - JSON シリアライズするオブジェクト
 * @param status - HTTP ステータスコード（デフォルト: 200）
 */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * エラーレスポンスを生成する
 * @param error - ユーザーに表示するエラーメッセージ
 * @param status - HTTP ステータスコード（デフォルト: 500）
 */
export function errorResponse(error: string, status = 500): Response {
  return new Response(JSON.stringify({ error }), { status, headers: JSON_HEADERS });
}

/**
 * 管理者権限チェック
 *
 * Why: 管理者専用の API ルートが複数あり、チェックロジックが重複していたため共通化。
 *      ok: false の場合はそのまま Response を返すこと。
 */
export function checkAdmin(
  locals: App.Locals
): { ok: true } | { ok: false; status: number; message: string } {
  const { session, member } = locals;
  if (!session || !member) {
    return { ok: false, status: 401, message: '認証が必要です。' };
  }
  if (member.role !== 'admin') {
    return { ok: false, status: 403, message: '管理者のみアクセスできます。' };
  }
  return { ok: true };
}
