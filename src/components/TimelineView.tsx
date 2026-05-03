/**
 * タイムラインビューコンポーネント
 *
 * 選択日の予約を設備ごとに時間軸上に可視化する。
 *
 * レイアウト:
 * - 1列目: 時刻ラベル（app_settings.start_hour 〜 end_hour）
 * - 2列目〜: 設備ごとのカラム（スロット + 予約ブロック）
 *   - maintenance 状態の設備は斜線オーバーレイを表示し、クリック不可
 *
 * インタラクション:
 * - 空きスロットのクリック → 新規予約モーダルを開く（active 設備のみ）
 * - 予約ブロックのクリック → 編集/閲覧モーダルを開く
 */

interface Member {
  id: string;
  name: string;
  role?: string;
}

interface Facility {
  id: string;
  name: string;
  status?: 'active' | 'maintenance' | 'retired';
}

interface Props {
  timelineDate: string;
  facilities: Facility[];
  reservations: any[];
  currentMember: Member;
  /** タイムライン表示開始時（app_settings.start_hour） */
  startHour: number;
  /** タイムライン表示終了時（app_settings.end_hour） */
  endHour: number;
  onFacilityClick: (facilityId: string, time: string) => void;
  onReservationClick: (reservation: any) => void;
}

const SLOT_HEIGHT = 30;

function calculatePosition(timeStr: string, startHour: number, slotHeight: number): number {
  if (!timeStr) return 0;
  const timePart = timeStr.includes('T')
    ? timeStr.split('T')[1]
    : timeStr.includes(' ')
      ? timeStr.split(' ')[1]
      : timeStr;
  const [hourStr, minStr] = timePart.split(':');
  const hours = parseInt(hourStr, 10);
  const minutes = parseInt(minStr, 10);
  if (isNaN(hours) || isNaN(minutes)) return 0;
  const minutesFromStart = (hours - startHour) * 60 + minutes;
  return (Math.max(0, minutesFromStart) / 30) * slotHeight;
}

/** 予約ステータスに応じた色を返す */
function getReservationColor(status: string | undefined, isOwner: boolean) {
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

export default function TimelineView({
  timelineDate,
  facilities,
  reservations,
  currentMember,
  startHour,
  endHour,
  onFacilityClick,
  onReservationClick,
}: Props) {
  const totalSlots = (endHour - startHour) * 2;
  const maxHeightPx = totalSlots * SLOT_HEIGHT;
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
              className="p-3 text-center text-sm font-semibold truncate flex items-center justify-center gap-1.5"
              style={{ color: 'var(--theme-text)', borderRight: '1px solid var(--theme-card-border)' }}
            >
              {f.name}
              {f.status === 'maintenance' && (
                <span
                  className="text-[0.6rem] font-normal px-1.5 py-0.5 rounded-full"
                  style={{ background: 'oklch(0.65 0.18 60 / 0.15)', color: 'oklch(0.55 0.18 60)' }}
                >
                  メンテナンス中
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── タイムライン本体 ── */}
        <div className="grid relative mt-3 pb-4" style={{ gridTemplateColumns }}>

          {/* 1列目: 時刻ラベル */}
          <div className="relative" style={{ borderRight: '1px solid var(--theme-card-border)' }}>
            {Array.from({ length: endHour - startHour + 1 }).map((_, i) => (
              <div
                key={i}
                className="relative text-right pr-2 text-xs font-medium"
                style={{ height: SLOT_HEIGHT * 2, color: 'var(--theme-text-secondary)' }}
              >
                <span
                  className="absolute -top-[0.6rem] right-2 px-1"
                  style={{ background: 'var(--theme-card-bg)' }}
                >
                  {String(startHour + i).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* 2列目〜: 設備ごとのスロット + 予約ブロック */}
          {facilities.map((f) => {
            const isMaintenance = f.status === 'maintenance';

            return (
              <div
                key={f.id}
                className="relative"
                style={{ borderRight: '1px solid var(--theme-card-border)' }}
              >
                {/* メンテナンス中の設備: 斜線オーバーレイ */}
                {isMaintenance && (
                  <div
                    className="absolute inset-0 z-10 pointer-events-none"
                    style={{
                      backgroundImage: `repeating-linear-gradient(
                        45deg,
                        transparent,
                        transparent 8px,
                        oklch(0.65 0.18 60 / 0.08) 8px,
                        oklch(0.65 0.18 60 / 0.08) 10px
                      )`,
                    }}
                  />
                )}

                {/* 時間スロットのグリッド線 */}
                {Array.from({ length: totalSlots }).map((_, slotIdx) => {
                  const hour = startHour + Math.floor(slotIdx / 2);
                  const min = (slotIdx % 2) * 30;
                  const isHourBoundary = min === 30;

                  return (
                    <div
                      key={slotIdx}
                      className={`transition-colors ${isMaintenance ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                      style={{
                        height: SLOT_HEIGHT,
                        borderBottom: isHourBoundary
                          ? '1px solid var(--theme-timeline-line)'
                          : '1px dashed var(--theme-timeline-dashed)',
                      }}
                      onMouseEnter={(e) => {
                        if (!isMaintenance) {
                          (e.currentTarget as HTMLElement).style.background = 'var(--theme-slot-hover)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = '';
                      }}
                      onClick={() => {
                        if (!isMaintenance) {
                          onFacilityClick(
                            f.id,
                            `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
                          );
                        }
                      }}
                    />
                  );
                })}

                {/* 予約ブロック */}
                {reservations
                  .filter(r => r.facilities?.id === f.id)
                  .map(r => {
                    const top = calculatePosition(r.start_time, startHour, SLOT_HEIGHT);
                    const rawEnd = calculatePosition(r.end_time, startHour, SLOT_HEIGHT);
                    const clippedEnd = Math.min(rawEnd, maxHeightPx);
                    const height = Math.max(clippedEnd - top, 10);
                    const isOwner = r.created_by_member?.id === currentMember?.id;
                    const colors = getReservationColor(r.status, isOwner);
                    const isPending = r.status === 'pending';
                    const isRejected = r.status === 'rejected';

                    return (
                      <div
                        key={r.id}
                        className="absolute rounded-md p-1.5 text-[0.7rem] overflow-hidden cursor-pointer shadow-sm transition-all hover:shadow-md z-10 border-l-4"
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          left: '2px',
                          width: 'calc(100% - 4px)',
                          ...colors,
                          opacity: isRejected ? 0.5 : 1,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onReservationClick(r);
                        }}
                      >
                        <div className="font-semibold truncate flex items-center gap-1">
                          {isPending && (
                            <span className="shrink-0 text-[0.55rem] font-bold px-1 rounded" style={{ background: 'oklch(0.65 0.18 60 / 0.3)' }}>
                              保留
                            </span>
                          )}
                          {isRejected && (
                            <span className="shrink-0 text-[0.55rem] font-bold px-1 rounded" style={{ background: 'oklch(0.62 0.22 25 / 0.2)' }}>
                              却下
                            </span>
                          )}
                          <span className="truncate">{r.purpose}</span>
                        </div>
                        {height > 30 && (
                          <div className="text-[0.6rem] opacity-70 truncate">
                            {r.created_by_member?.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}