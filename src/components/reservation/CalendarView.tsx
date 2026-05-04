/**
 * カレンダービューコンポーネント
 *
 * 月間カレンダーを表示し、各日セルに予約件数のドットを描画する。
 * 日付セルをクリックするとタイムラインビューへ遷移する。
 *
 * 設計:
 * - 前月・次月の日付も含めた 35 or 42 マスのグリッドを生成
 * - 日付計算は Date コンストラクタに委譲して月の境界バグを排除
 * - 今日の日付は赤枠でハイライト
 * - 自分の予約があるドットは Primary カラーで表示
 * - maxFutureDate を超えた日付はクリック不可・グレーアウト（管理者は除外）
 */
import { useMemo } from 'preact/hooks';
import { toDateStr } from '../../utils/date-utils';

interface Member {
  id: string;
  name: string;
  role?: string;
}

interface Props {
  calendarDate: Date;
  onSelectDate: (dateStr: string) => void;
  reservations: any[];
  currentMember: Member;
  /** 予約可能な最大日付（この日以降はクリック不可）。管理者は undefined = 制限なし */
  maxFutureDate?: Date;
  /** 予約可能な過去最大日（この日以前はクリック不可）。管理者は undefined = 制限なし */
  maxPastDate?: Date;
}

interface CalendarDay {
  type: 'current' | 'other';
  day: number;
  dateStr: string;
  count: number;
  hasOwnReservation: boolean;
  dow: number;
  /** 予約可能範囲外（maxFutureDate を超えている）か */
  isOutOfRange: boolean;
}

export default function CalendarView({
  calendarDate,
  onSelectDate,
  reservations,
  currentMember,
  maxFutureDate,
  maxPastDate,
}: Props) {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  // Why: useMemo の空依存配列だと初回マウント時に固定されてしまい、
  //      日付をまたいでブラウザを開き続けた場合に今日ハイライトが更新されない。
  //      計算コストが極めて低いため useMemo を使わず毎回計算する。
  const t = new Date();
  const todayStr = toDateStr(t);

  // maxFutureDate/maxPastDate を "YYYY-MM-DD" 文字列に変換（比較用）
  const maxFutureDateStr = maxFutureDate ? toDateStr(maxFutureDate) : null;
  const maxPastDateStr = maxPastDate ? toDateStr(maxPastDate) : null;

  const days = useMemo((): CalendarDay[] => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const calendarDays: CalendarDay[] = [];

    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      const dateStr = toDateStr(d);
      calendarDays.push({
        type: 'other', day: d.getDate(), dateStr,
        count: 0, hasOwnReservation: false, dow: d.getDay(),
        isOutOfRange: (maxFutureDateStr ? dateStr > maxFutureDateStr : false) || (maxPastDateStr ? dateStr < maxPastDateStr : false),
      });
    }

    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const dateStr = toDateStr(date);
      const dayReservations = reservations.filter(r => r.start_time.startsWith(dateStr));
      const hasOwn = dayReservations.some(r => r.created_by_member?.id === currentMember?.id);
      calendarDays.push({
        type: 'current', day: d, dateStr,
        count: dayReservations.length, hasOwnReservation: hasOwn, dow: date.getDay(),
        isOutOfRange: (maxFutureDateStr ? dateStr > maxFutureDateStr : false) || (maxPastDateStr ? dateStr < maxPastDateStr : false),
      });
    }

    const totalCells = calendarDays.length;
    const targetCells = totalCells <= 35 ? 35 : 42;
    for (let i = 1; i <= targetCells - totalCells; i++) {
      const d = new Date(year, month + 1, i);
      const dateStr = toDateStr(d);
      calendarDays.push({
        type: 'other', day: d.getDate(), dateStr,
        count: 0, hasOwnReservation: false, dow: d.getDay(),
        isOutOfRange: (maxFutureDateStr ? dateStr > maxFutureDateStr : false) || (maxPastDateStr ? dateStr < maxPastDateStr : false),
      });
    }

    return calendarDays;
  }, [year, month, reservations, currentMember, maxFutureDateStr, maxPastDateStr]);

  return (
    <div className="animate-fade-in w-full max-w-5xl mx-auto">
      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
        {['日', '月', '火', '水', '木', '金', '土'].map((dayLabel, idx) => (
          <div
            key={dayLabel}
            className={`py-2 text-center text-xs sm:text-sm font-semibold tracking-wider ${
              idx === 0 ? 'text-danger-500' : idx === 6 ? 'text-primary-500' : ''
            }`}
            style={idx !== 0 && idx !== 6 ? { color: 'var(--theme-text-secondary)' } : undefined}
          >
            {dayLabel}
          </div>
        ))}
      </div>

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((d) => {
          const isToday = d.dateStr === todayStr;
          const isOtherMonth = d.type === 'other';
          const isSunday = d.dow === 0;
          const isSaturday = d.dow === 6;
          const isDisabled = d.isOutOfRange;

          return (
            <div
              key={d.dateStr}
              className={`flex flex-col items-center pt-2 pb-1 px-1 sm:pt-3 sm:px-2 rounded-xl transition-all duration-200 min-h-[70px] sm:min-h-[90px] aspect-square relative ${
                isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'
              } ${!isOtherMonth && !isDisabled ? 'hover:-translate-y-0.5 hover:shadow-md hover:z-10 bg-theme-card' : ''}`}
              style={{
                background: isToday
                  ? 'var(--theme-today-bg)'
                  : isDisabled
                    ? 'var(--theme-input-bg)'
                    : isOtherMonth
                      ? 'transparent'
                      : 'var(--theme-card-bg)',
                border: isToday
                  ? '1.5px solid var(--theme-today-border)'
                  : `1px solid ${isOtherMonth || isDisabled ? 'transparent' : 'var(--theme-card-border)'}`,
                opacity: isOtherMonth ? 0.35 : isDisabled ? 0.4 : 1,
              }}
              onClick={() => {
                if (!isDisabled) onSelectDate(d.dateStr);
              }}
            >
              {/* 予約不可バッジ（範囲外） */}
              {isDisabled && !isOtherMonth && (
                <div
                  className="absolute top-1 right-1 text-[0.5rem] font-medium px-1 rounded"
                  style={{ background: 'var(--theme-card-border)', color: 'var(--theme-text-secondary)' }}
                >
                  予約不可
                </div>
              )}

              <span
                className={`text-sm sm:text-base mb-1 ${
                  isToday ? 'font-bold text-danger-500' :
                  isSunday ? 'font-medium text-danger-400' :
                  isSaturday ? 'font-medium text-primary-400' :
                  'font-medium'
                }`}
                style={
                  !isToday && !isSunday && !isSaturday
                    ? { color: isDisabled ? 'var(--theme-text-secondary)' : 'var(--theme-text)' }
                    : undefined
                }
              >
                {d.day}
              </span>

              {d.count > 0 && !isDisabled && (
                <div className="absolute bottom-2 left-0 right-0 flex flex-wrap justify-center gap-1 px-1">
                  {Array.from({ length: Math.min(d.count, 4) }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shadow-sm ${
                        d.hasOwnReservation ? 'bg-primary-500' : ''
                      }`}
                      style={!d.hasOwnReservation ? { background: 'var(--theme-text-secondary)', opacity: 0.5 } : undefined}
                    />
                  ))}
                  {d.count > 4 && (
                    <span
                      className="text-[0.65rem] leading-none self-center font-medium ml-0.5"
                      style={{ color: 'var(--theme-text-secondary)' }}
                    >
                      +{d.count - 4}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}