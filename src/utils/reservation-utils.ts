/**
 * 予約に関するバリデーションやフォーマット処理の共通ユーティリティ
 */

/**
 * 予約時間（分）が設定要件を満たしているか検証します。
 * @returns エラーメッセージ（正常な場合はnull）
 */
export function validateReservationDuration(
  durationMin: number,
  minMinutes: number,
  maxHours: number
): string | null {
  if (durationMin < minMinutes) {
    return `予約時間は最低 ${minMinutes} 分以上必要です。`;
  }
  if (durationMin % minMinutes !== 0) {
    return `予約時間は ${minMinutes} 分単位で設定してください（例: ${minMinutes}, ${minMinutes * 2}分...）。`;
  }
  const maxMin = maxHours * 60;
  if (durationMin > maxMin) {
    return `1回あたりの予約は最大 ${maxHours} 時間までです。`;
  }
  return null;
}

/**
 * ISO日時文字列の期間（分）を計算して検証します。
 * 主にAPIバックエンド用です。
 */
export function validateIsoDuration(
  startTime: string,
  endTime: string,
  minMinutes: number,
  maxHours: number
): string | null {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMin = (end.getTime() - start.getTime()) / 60000;
  
  return validateReservationDuration(durationMin, minMinutes, maxHours);
}

/**
 * Supabaseのエラーが排他制約（時間重複）違反かどうかを判定します。
 */
export function isExclusionViolation(error: any): boolean {
  return (
    error?.code === '23P01' ||
    error?.message?.includes('conflicting key value violates exclusion constraint')
  );
}

/**
 * SupabaseのエラーがDBトリガーによる時間ロック違反かどうかを判定します。
 */
export function isTimeLockError(error: any): boolean {
  return error?.message?.includes('時間以上経過');
}

/**
 * 予約のステータスに応じたカラー情報を取得します。
 */
export function getReservationColor(status: string | undefined, isOwner: boolean) {
  if (status === 'pending') {
    return {
      background: isOwner
        ? 'linear-gradient(135deg, oklch(0.65 0.18 60), oklch(0.60 0.17 50))'
        : 'var(--theme-input-bg)',
      borderColor: 'oklch(0.70 0.18 60)',
      color: isOwner ? 'white' : 'var(--theme-text)',
    };
  }
  if (status === 'rejected') {
    return {
      background: 'oklch(0.62 0.22 25 / 0.15)',
      borderColor: 'oklch(0.62 0.22 25 / 0.5)',
      color: 'var(--theme-text)',
    };
  }
  // approved (default)
  return {
    background: isOwner
      ? 'linear-gradient(135deg, oklch(0.55 0.21 250), oklch(0.50 0.19 260))'
      : 'var(--theme-input-bg)',
    borderColor: isOwner ? 'oklch(0.66 0.17 245)' : 'var(--theme-text-secondary)',
    color: isOwner ? 'white' : 'var(--theme-text)',
  };
}
