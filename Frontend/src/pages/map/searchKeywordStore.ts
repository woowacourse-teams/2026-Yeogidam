export type SearchKeywordStore = {
  get: () => string;
  set: (value: string) => void;
  subscribe: (listener: () => void) => () => void;
};

/**
 * 지도 검색창에 입력 중인 검색어입니다. 글자마다 지도 화면 전체가 다시 그려지지 않도록
 * 검색창만 이 값을 구독합니다. 지금 화면과 뒤로 가기 미리보기의 검색창이 같은 값을 봅니다.
 */
export function createSearchKeywordStore(): SearchKeywordStore {
  let keyword = '';
  const listeners = new Set<() => void>();
  return {
    get: () => keyword,
    set: value => {
      if (value === keyword) return;
      keyword = value;
      listeners.forEach(listener => listener());
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
