import {useCallback, useEffect, useState} from 'react';

import {
  getRecentSearches,
  setRecentSearches as persistRecentSearches,
} from '../../../lib/searchHistoryStorage';

const MAX_RECENT_SEARCHES = 10;

/**
 * 보관함 검색의 최근 검색어를 기기 저장소에서 읽어 두고, 바뀔 때마다 다시 저장합니다.
 * 저장소를 다 읽기 전에는 쓰지 않으므로 빈 목록이 저장된 기록을 덮지 않습니다.
 */
export function useRecentSearches() {
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isRecentSearchesHydrated, setIsRecentSearchesHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getRecentSearches()
      .then(savedSearches => {
        if (!isMounted) {
          return;
        }

        setRecentSearches(savedSearches.slice(0, MAX_RECENT_SEARCHES));
        setIsRecentSearchesHydrated(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setIsRecentSearchesHydrated(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isRecentSearchesHydrated) {
      return;
    }

    persistRecentSearches(recentSearches).catch(() => undefined);
  }, [isRecentSearchesHydrated, recentSearches]);

  /** 앞뒤 공백을 지운 검색어를 맨 앞에 두고, 같은 검색어는 하나만 남겨 10개까지 둡니다. 빈 검색어는 무시합니다. */
  const saveRecentSearch = useCallback((value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return;
    }

    setRecentSearches(current => {
      const nextSearches = current.filter(item => item !== normalizedValue);
      return [normalizedValue, ...nextSearches].slice(0, MAX_RECENT_SEARCHES);
    });
  }, []);

  return {recentSearches, saveRecentSearch};
}
