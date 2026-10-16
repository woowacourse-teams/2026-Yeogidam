import {useCallback, useEffect, useRef, useState} from 'react';

import {
  getRecentSearches,
  setRecentSearches as persistRecentSearches,
} from '../../../lib/searchHistoryStorage';
import {addRecentSearch, MAX_RECENT_SEARCHES} from '../recentSearches';

/**
 * 보관함 검색의 최근 검색어를 기기 저장소에서 읽어 두고, 검색어를 저장할 때만 저장소에 씁니다.
 * 읽은 목록은 다시 쓰지 않고, 저장소를 다 읽기 전에 저장한 검색어도 쓰지 않으므로 빈 목록이 저장된 기록을 덮지 않습니다.
 */
export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  // 저장소에 써도 되는지만 정하고 그리는 데는 쓰지 않아 상태가 아니라 참조로 둡니다.
  const isHydratedRef = useRef(false);
  // 저장할 다음 목록은 그릴 때 잡힌 값이 아니라 가장 최근 목록에서 계산합니다. 읽은 목록이 아직 그려지기 전에
  // 저장해도 읽은 기록을 지키기 위해서입니다.
  const latestSearchesRef = useRef<string[]>([]);

  useEffect(() => {
    let isMounted = true;

    // 저장 모듈이 읽기 실패를 빈 목록으로 삼키므로 여기서는 결과만 받습니다.
    getRecentSearches().then(savedSearches => {
      if (!isMounted) {
        return;
      }

      const loadedSearches = savedSearches.slice(0, MAX_RECENT_SEARCHES);
      latestSearchesRef.current = loadedSearches;
      setRecentSearches(loadedSearches);
      isHydratedRef.current = true;
    });

    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * 검색어를 최근 검색어에 더하고 같은 목록을 저장소에 씁니다. 빈 검색어면 아무것도 바꾸지 않습니다.
   * 상태 갱신 함수 안에서 쓰면 StrictMode가 갱신 함수를 두 번 돌릴 때 두 번 쓰므로, 다음 목록을 먼저 계산해 여기서 한 번 씁니다.
   */
  const saveRecentSearch = useCallback((value: string) => {
    const currentSearches = latestSearchesRef.current;
    const nextSearches = addRecentSearch(currentSearches, value);
    if (nextSearches === currentSearches) {
      return;
    }

    latestSearchesRef.current = nextSearches;
    setRecentSearches(nextSearches);
    if (isHydratedRef.current) {
      persistRecentSearches(nextSearches);
    }
  }, []);

  return {recentSearches, saveRecentSearch};
}
