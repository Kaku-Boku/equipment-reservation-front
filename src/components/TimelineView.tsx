/**
 * タイムラインビューコンポーネント
 *
 * 選択日の予約を設備ごとに時間軸上に可視化する。
 *
 * レイアウト:
 * - 1列目: 時刻ラベル（8:00〜20:00）
 * - 2列目〜: 設備ごとのカラム（30分刻みのスロット + 予約ブロック）
 *
 * インタラクション:
 * - 空きスロットのクリック → 新規予約モーダルを開く
 * - 予約ブロックのクリック → 編集/閲覧モーダルを開く
 *
 * 注意:
 * - start_time/end_time は "YYYY-MM-DDTHH:MM:SS" 形式を想定
 * - 8:00 より前の予約は上端に固定、20:00 以降は下端でクリップ
 */

/** メンバー情報 */
interface Member {
  id: string;
  name: string;
  role?: string;
}

/** 設備情報 */
interface Facility {
  id: string;
  name: string;
}

/** コンポーネント Props */
interface Props {
  timelineDate: string;
  facilities: Facility[];
  reservations: any[];
  currentMember: Member;
  onFacilityClick: (facilityId: string, time: string) => void;
  onReservationClick: (reservation: any) => void;
}

/** タイムライン定数 */
const START_HOUR = 8;
const END_HOUR = 20;
const SLOT_HEIGHT = 30;
const TOTAL_SLOTS = (END_HOUR - START_HOUR) * 2;
const MAX_HEIGHT_PX = TOTAL_SLOTS * SLOT_HEIGHT;

/**
 * 時刻文字列からタイムライン上の Y 座標（px）を計算する
 *
 * @param timeStr - "YYYY-MM-DDTHH:MM:SS" / "HH:MM" 等
 * @param startHour - タイムラインの開始時間（デフォルト 8）
 * @param slotHeight - 30分1スロットの高さ（px）
 */
function calculatePosition(timeStr: string, startHour: number, slotHeight: number): number {
  if (!timeStr) return 0;

  // 時刻部分だけを安全に抽出
  const timePart = timeStr.includes('T')
    ? timeStr.split('T')[1]
    : timeStr.includes(' ')
      ? timeStr.split(' ')[1]
      : timeStr;

  const [hourStr, minStr] = timePart.split(':');
  const hours = parseInt(hourStr, 10);
  const minutes = parseInt(minStr, 10);

  if (isNaN(hours) || isNaN(minutes)) return 0;

  // 開始時間を起点とした分数からピクセル位置を算出
  const minutesFromStart = (hours - startHour) * 60 + minutes;
  // 開始時間より前は上端に固定
  const clamped = Math.max(0, minutesFromStart);
  return (clamped / 30) * slotHeight;
}

export default function TimelineView({
  timelineDate,
  facilities,
  reservations,
  currentMember,
  onFacilityClick,
  onReservationClick,
}: Props) {
  const gridTemplateColumns = `60px repeat(${facilities.length}, minmax(120px, 1fr))`;

  return (
    <div
      className="overflow-x-auto rounded-xl shadow-sm animate-fade-in"
      style={{
        background: 'var(--theme-card-bg)',
        border: '1px solid var(--theme-card-border)',
      }}
    >
      <div className="min-w-[700px]">

        {/* ── ヘッダー（設備名） ── */}
        <div
          className="grid sticky top-0 z-20"
          style={{
            gridTemplateColumns,
            background: 'var(--theme-card-bg)',
            borderBottom: '1px solid var(--theme-card-border)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className="p-3 text-center text-xs font-semibold"
            style={{ color: 'var(--theme-text-secondary)', borderRight: '1px solid var(--theme-card-border)' }}
          >
            時間
          </div>
          {facilities.map(f => (
            <div
              key={f.id}
              className="p-3 text-center text-sm font-semibold truncate"
              style={{ color: 'var(--theme-text)', borderRight: '1px solid var(--theme-card-border)' }}
            >
              {f.name}
            </div>
          ))}
        </div>

        {/* ── タイムライン本体 ── */}
        <div className="grid relative mt-3 pb-4" style={{ gridTemplateColumns }}>

          {/* 1列目: 時刻ラベル */}
          <div className="relative" style={{ borderRight: '1px solid var(--theme-card-border)' }}>
            {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, i) => (
              <div
                key={i}
                className="relative text-right pr-2 text-xs font-medium"
                style={{ height: SLOT_HEIGHT * 2, color: 'var(--theme-text-secondary)' }}
              >
                <span
                  className="absolute -top-[0.6rem] right-2 px-1"
                  style={{ background: 'var(--theme-card-bg)' }}
                >
                  {String(START_HOUR + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* 2列目〜: 設備ごとのスロット + 予約ブロック */}
          {facilities.map((f) => (
            <div key={f.id} className="relative" style={{ borderRight: '1px solid var(--theme-card-border)' }}>

              {/* 時間スロットのグリッド線 */}
              {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                const hour = START_HOUR + Math.floor(slotIdx / 2);
                const min = (slotIdx % 2) * 30;
                const isHourBoundary = min === 30;

                return (
                  <div
                    key={slotIdx}
                    className="cursor-pointer transition-colors"
                    style={{
                      height: SLOT_HEIGHT,
                      borderBottom: isHourBoundary
                        ? '1px solid var(--theme-timeline-line)'
                        : '1px dashed var(--theme-timeline-dashed)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'var(--theme-slot-hover)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = '';
                    }}
                    onClick={() =>
                      onFacilityClick(
                        f.id,
                        `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
                      )
                    }
                  />
                );
              })}

              {/* 予約ブロック */}
              {reservations
                .filter(r => r.facilities?.id === f.id)
                .map(r => {
                  const top = calculatePosition(r.start_time, START_HOUR, SLOT_HEIGHT);
                  const rawEnd = calculatePosition(r.end_time, START_HOUR, SLOT_HEIGHT);
                  // 20:00 を超える予約はタイムライン下端でクリップ
                  const clippedEnd = Math.min(rawEnd, MAX_HEIGHT_PX);
                  // 最低 10px の高さを確保（クリック不能を防止）
                  const height = Math.max(clippedEnd - top, 10);

                  const isOwner = r.created_by_member?.id === currentMember?.id;

                  return (
                    <div
                      key={r.id}
                      className="absolute rounded-md p-1.5 text-[0.7rem] overflow-hidden cursor-pointer shadow-sm transition-all hover:shadow-md z-10 border-l-4"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        left: '2px',
                        width: 'calc(100% - 4px)',
                        background: isOwner
                          ? 'linear-gradient(135deg, oklch(0.55 0.21 250), oklch(0.50 0.19 260))'
                          : 'var(--theme-input-bg)',
                        borderColor: isOwner
                          ? 'oklch(0.66 0.17 245)'
                          : 'var(--theme-text-secondary)',
                        color: isOwner ? 'white' : 'var(--theme-text)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReservationClick(r);
                      }}
                    >
                      <div className="font-semibold truncate">{r.purpose}</div>
                      {height > 30 && (
                        <div className="text-[0.6rem] opacity-70 truncate">
                          {r.created_by_member?.name}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}