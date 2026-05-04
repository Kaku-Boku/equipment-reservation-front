/**
 * 日付・時間操作の共通ユーティリティ
 */

/**
 * Dateオブジェクトから YYYY-MM-DD 形式の文字列を生成します。
 */
export const toDateStr = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * YYYY-MM-DD 形式の文字列から YYYY年MM月DD日(曜) 形式の文字列を生成します。
 */
export const formatDateJa = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})`;
};

/**
 * 時刻文字列 (ISOまたはHH:mm) から HH:mm 形式を抽出します。
 */
export const extractTime = (t: string): string => {
  if (!t) return '';
  return t.includes('T') ? t.split('T')[1].substring(0, 5) : t.substring(0, 5);
};

/**
 * タイムライン上の表示位置 (top) を計算します。
 */
export const calculateTimelinePosition = (timeStr: string, startHour: number, slotHeight: number): number => {
  if (!timeStr) return 0;
  const timePart = timeStr.includes('T') ? timeStr.split('T')[1] : timeStr.includes(' ') ? timeStr.split(' ')[1] : timeStr;
  const [hourStr, minStr] = timePart.split(':');
  const hours = parseInt(hourStr, 10);
  const minutes = parseInt(minStr, 10);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  
  const minutesFromStart = (hours - startHour) * 60 + minutes;
  return (Math.max(0, minutesFromStart) / 30) * slotHeight;
};

/**
 * 2つの時刻 (HH:mm) の差分を分単位で計算します。
 */
export const calculateDurationMin = (startTime: string, endTime: string): number => {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
};
