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
 */
import { useMemo } from 'preact/hooks';

/** メンバー情報（予約の所有判定に使用） */
interface Member {
  id: string;
  name: string;
  role?: string;
}

/** コンポーネント Props */
interface Props {
  calendarDate: Date;
  onSelectDate: (dateStr: string) => void;
  reservations: any[];
  currentMember: Member;
}

/** カレンダーの1マス分のデータ */
interface CalendarDay {
  /** 当月 or 前月/次月 */
  type: 'current' | 'other';
  /** 日（1〜31） */
  day: number;
  /** "YYYY-MM-DD" 形式の日付文字列 */
  dateStr: string;
  /** その日の予約件数 */
  count: number;
  /** 自分の予約が含まれるか */
  hasOwnReservation: boolean;
  /** 曜日（0=日, 6=土） */
  dow: number;
}

export default function CalendarView({ calendarDate, onSelectDate, reservations, currentMember }: Props) {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  // 今日の日付文字列（ハイライト判定用）
  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  /** Date を "YYYY-MM-DD" に変換するヘルパー */
  const toDateStr = (d: Date): string => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // カレンダーのマス目を計算
  const days = useMemo((): CalendarDay[] => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = firstDay.getDay(); // 0=日曜
    const totalDays = lastDay.getDate();

    const calendarDays: CalendarDay[] = [];

    // 1. 前月のマスを埋める（Date コンストラクタに月跨ぎを委譲）
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      calendarDays.push({
        type: 'other',
        day: d.getDate(),
        dateStr: toDateStr(d),
        count: 0,
        hasOwnReservation: false,
        dow: d.getDay(),
      });
    }

    // 2. 当月のマスを計算
    for (let d = 1; d <= totalDays; d++) {
      const date = new Date(year, month, d);
      const dateStr = toDateStr(date);

      // 予約データをフィルタリング
      const dayReservations = reservations.filter(r => r.start_time.startsWith(dateStr));
      const hasOwn = dayReservations.some(r => r.created_by_member?.id === currentMember?.id);

      calendarDays.push({
        type: 'current',
        day: d,
        dateStr,
        count: dayReservations.length,
        hasOwnReservation: hasOwn,
        dow: date.getDay(),
      });
    }

    // 3. 次月のマスを埋める（35 or 42 マスに調整）
    const totalCells = calendarDays.length;
    const targetCells = totalCells <= 35 ? 35 : 42;
    const remaining = targetCells - totalCells;

    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      calendarDays.push({
        type: 'other',
        day: d.getDate(),
        dateStr: toDateStr(d),
        count: 0,
        hasOwnReservation: false,
        dow: d.getDay(),
      });
    }

    return calendarDays;
  }, [year, month, reservations, currentMember]);

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

          return (
            <div
              key={d.dateStr}
              className="flex flex-col items-center pt-2 pb-1 px-1 sm:pt-3 sm:px-2 rounded-xl transition-all duration-200 cursor-pointer min-h-[70px] sm:min-h-[90px] aspect-square relative"
              style={{
                background: isToday
                  ? 'var(--theme-today-bg)'
                  : isOtherMonth
                    ? 'transparent'
                    : 'var(--theme-card-bg)',
                border: isToday
                  ? '1.5px solid var(--theme-today-border)'
                  : `1px solid ${isOtherMonth ? 'transparent' : 'var(--theme-card-border)'}`,
                opacity: isOtherMonth ? 0.35 : 1,
              }}
              onClick={() => onSelectDate(d.dateStr)}
              onMouseEnter={(e) => {
                if (!isOtherMonth) {
                  (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = '';
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
            >
              {/* 日付テキスト */}
              <span
                className={`text-sm sm:text-base mb-1 ${
                  isToday ? 'font-bold text-danger-500' :
                  isSunday ? 'font-medium text-danger-400' :
                  isSaturday ? 'font-medium text-primary-400' :
                  'font-medium'
                }`}
                style={
                  !isToday && !isSunday && !isSaturday
                    ? { color: 'var(--theme-text)' }
                    : undefined
                }
              >
                {d.day}
              </span>

              {/* 予約ドット */}
              {d.count > 0 && (
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