import {useEffect, useRef} from 'react';
import type {ScrollView} from 'react-native';

type Options = {
  /** 상세에서 돌아왔을 때 되돌릴 스크롤 위치입니다. 0 이하면 옮기지 않습니다. */
  initialScrollOffset: number;
  isLoading: boolean;
  hasSavedPlaces: boolean;
};

/**
 * 보관함 목록의 스크롤을 맡습니다. 목록을 다 읽어 장소가 있으면 다음 프레임에 저장해 둔 위치로 옮기고,
 * 맨 위로 올리는 동작을 돌려줍니다.
 */
export function useSavedPlacesScroll({initialScrollOffset, isLoading, hasSavedPlaces}: Options) {
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (isLoading || !hasSavedPlaces || initialScrollOffset <= 0) {
      return;
    }

    const restoreScrollPosition = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: initialScrollOffset,
        animated: false,
      });
    });

    return () => cancelAnimationFrame(restoreScrollPosition);
  }, [hasSavedPlaces, initialScrollOffset, isLoading]);

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  return {scrollViewRef, scrollToTop};
}
