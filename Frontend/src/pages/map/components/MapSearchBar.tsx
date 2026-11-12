import React, { useSyncExternalStore } from 'react';

import { SearchBar } from '../../../components/SearchBar';
import type { SearchKeywordStore } from '../searchKeywordStore';

type MapSearchBarProps = Omit<React.ComponentProps<typeof SearchBar>, 'value'> & {
  keywordStore: SearchKeywordStore;
  /** 검색을 지운 상태를 보여 주는 뒤로 가기 미리보기에서는 빈 검색창을 그립니다. */
  clearsSearch?: boolean;
};

/** 검색어를 직접 구독해 입력할 때 검색창만 다시 그립니다. */
export function MapSearchBar({
  keywordStore,
  clearsSearch = false,
  ...props
}: MapSearchBarProps) {
  const keyword = useSyncExternalStore(keywordStore.subscribe, keywordStore.get);
  return <SearchBar {...props} value={clearsSearch ? '' : keyword} />;
}
