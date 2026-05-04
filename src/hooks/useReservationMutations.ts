/**
 * 予約操作（作成、更新、削除、承認、却下）のAPI呼び出しを管理するカスタムフック
 */

export function useReservationMutations() {
  /** 予約の保存（新規作成または更新） */
  const saveReservation = async (data: any) => {
    const method = data.id ? 'PUT' : 'POST';
    const payload = {
      ...data,
      start_time: `${data.date}T${data.start_time}:00`,
      end_time: `${data.date}T${data.end_time}:00`,
    };
    delete payload.date;

    const response = await fetch('/api/reserve', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || '予約の保存に失敗しました。');
    }
  };

  /** 予約の削除 */
  const deleteReservation = async (id: string) => {
    const response = await fetch('/api/reserve', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || '予約の削除に失敗しました。');
    }
  };

  /** 予約の承認・却下（管理者用） */
  const updateReservationStatus = async (id: string, status: 'approved' | 'rejected') => {
    const response = await fetch('/api/approve', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(errorData.error || '操作に失敗しました。');
    }
  };

  return { saveReservation, deleteReservation, updateReservationStatus };
}
