import {useCallback, useEffect, useRef} from 'react';
import type {ScrollView} from 'react-native';

/**
 * 상세에서 목록으로 돌아오면 목록을 보던 스크롤 위치로 되돌립니다. 기억한 스크롤 위치는 카드 노출
 * 판단도 같이 읽으므로 scrollOffsetRef로 내어 줍니다.
 *
 * @param listVisible 상세가 아니라 목록이 보이는지입니다.
 * @param loading 첫 페이지를 읽는 중인지입니다. 읽는 동안에는 되돌리지 않습니다.
 * @param reelCount 목록 항목 수입니다. 바뀌면 되돌릴 수 있는지 다시 봅니다.
 */
export function useHistoryScrollRestore({
  listVisible,
  loading,
  reelCount,
}: {
  listVisible: boolean;
  loading: boolean;
  reelCount: number;
}) {
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);

  useEffect(() => {
    // TODO(review): 위치가 0이라 되돌리지 않을 때도 표시를 지우지 않아, 나중에 항목 수가 바뀌면 그때의 위치로 scrollTo를 한 번 부릅니다.
    if (
      !listVisible ||
      loading ||
      !shouldRestoreScrollRef.current ||
      scrollOffsetRef.current <= 0
    ) {
      return;
    }

    const restoreScroll = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: scrollOffsetRef.current,
        animated: false,
      });
      shouldRestoreScrollRef.current = false;
    });

    return () => cancelAnimationFrame(restoreScroll);
  }, [listVisible, loading, reelCount]);

  /** 목록의 지금 스크롤 위치를 기억합니다. */
  const recordScrollOffset = useCallback((offsetY: number) => {
    scrollOffsetRef.current = offsetY;
  }, []);

  /** 상세에서 목록으로 돌아갈 때 부릅니다. 목록이 다시 보이면 기억한 위치로 되돌립니다. */
  const restoreOnReturn = useCallback(() => {
    shouldRestoreScrollRef.current = true;
  }, []);

  /** 맨 위에 새 항목이 생길 때 부릅니다. 기억한 위치를 지워 되돌리지 않습니다. */
  const resetToTop = useCallback(() => {
    scrollOffsetRef.current = 0;
    shouldRestoreScrollRef.current = false;
  }, []);

  return {scrollViewRef, scrollOffsetRef, recordScrollOffset, restoreOnReturn, resetToTop};
}
