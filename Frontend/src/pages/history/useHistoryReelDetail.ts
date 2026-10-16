import {useEffect, useRef, useState} from 'react';

import {getHistoryReelDetail} from '../../entities/content/history-api';
import type {HistoryReel, HistoryReelDetail} from '../../entities/content/types';

/**
 * 히스토리 상세에 보일 공유 정보와 찾은 장소를 읽어 detail, loading, error로 돌려줍니다.
 *
 * @param guestDetail 비회원 체험 상세입니다. undefined가 아니면 서버에 묻지 않고 이 값을 씁니다.
 * 항목 ID가 바뀔 때만 읽으므로, 폴링이 같은 항목을 새 객체로 바꿔도 다시 읽지 않습니다.
 */
export function useHistoryReelDetail(
  reel: HistoryReel,
  guestDetail?: HistoryReelDetail | null,
) {
  const [detail, setDetail] = useState<HistoryReelDetail | null>(guestDetail ?? null);
  const [loading, setLoading] = useState(guestDetail === undefined);
  const [error, setError] = useState(false);
  // 폴링이 같은 항목을 새 객체로 바꿔도 다시 조회하지 않도록 ID가 바뀔 때만 읽는다.
  const reelRef = useRef(reel);
  reelRef.current = reel;

  useEffect(() => {
    if (guestDetail !== undefined) {
      setDetail(guestDetail);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    // TODO(review): 늦은 응답을 거르지 않아 마운트된 채 reel.id가 바뀌면 이전 응답이 새 상세를 덮어쓸 수 있습니다. 지금은 상세가 항목마다 새로 마운트되어 드러나지 않습니다.
    getHistoryReelDetail(reelRef.current)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [guestDetail, reel.id]);

  return { detail, loading, error };
}
