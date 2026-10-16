/** 보관함 검색이 기억하는 최근 검색어의 최대 개수입니다. */
export const MAX_RECENT_SEARCHES = 10;

/**
 * 앞뒤 공백을 지운 검색어를 최근 검색어 맨 앞에 두고, 같은 검색어는 하나만 남겨 10개까지 둡니다.
 * 빈 검색어면 받은 목록을 그대로(같은 배열로) 돌려줘, 부르는 쪽이 바뀐 것이 없다고 알 수 있게 합니다.
 */
export function addRecentSearch(searches: string[], value: string): string[] {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return searches;
  }

  const otherSearches = searches.filter(item => item !== normalizedValue);
  return [normalizedValue, ...otherSearches].slice(0, MAX_RECENT_SEARCHES);
}
