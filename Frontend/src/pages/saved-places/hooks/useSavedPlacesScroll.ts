import {useEffect, useRef} from 'react';
import type {ScrollView} from 'react-native';

type Options = {
  /** 상세에서 돌아왔을 때 되돌릴 스크롤 위치입니다. 0 이하면 옮기지 않습니다. */
  initialScrollOffset: number;
  isLoading: boolean;
  hasSavedPlaces: boolean;
};

/**
 * 보관함 목록의 스크롤을 맡습니다. 목록을 다 읽어 장소가 있으면 다음 프레임에 처음 받은 위치로 한 번만 옮기고,
 * 맨 위로 올리는 동작을 돌려줍니다. 화면이 상세 뒤에 남아 있는 동안 App이 다시 그리며 넘긴 위치가 바뀌어도
 * 다시 옮기지 않아, 사용자가 옮긴 스크롤이 튀지 않습니다.
 */
export function useSavedPlacesScroll({initialScrollOffset, isLoading, hasSavedPlaces}: Options) {
  const scrollViewRef = useRef<ScrollView>(null);
  const initialScrollOffsetRef = useRef(initialScrollOffset);
  const hasRestoredInitialScrollRef = useRef(false);

  useEffect(() => {
    if (
      hasRestoredInitialScrollRef.current ||
      isLoading ||
      !hasSavedPlaces ||
      initialScrollOffsetRef.current <= 0
    ) {
      return;
    }

    const restoreScrollPosition = requestAnimationFrame(() => {
      hasRestoredInitialScrollRef.current = true;
      scrollViewRef.current?.scrollTo({
        y: initialScrollOffsetRef.current,
        animated: false,
      });
    });

    return () => cancelAnimationFrame(restoreScrollPosition);
  }, [hasSavedPlaces, isLoading]);

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  return {scrollViewRef, scrollToTop};
}
