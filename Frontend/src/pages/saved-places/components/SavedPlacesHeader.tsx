import React from 'react';
import {SearchBar} from '../../../components/SearchBar';

/** 장소 탭은 이름·주소·카테고리, 게시물 탭은 캡션을 찾습니다. */
export const SAVED_LIBRARY_SEARCH_PLACEHOLDER = '장소, 지역, 게시물 검색';

type SavedPlacesHeaderProps = {
  /** 보관함에 결과를 보여 주고 있는 검색어입니다. 없으면 null입니다. */
  query: string | null;
  onPressSearch: () => void;
  onClearSearch: () => void;
};

export function SavedPlacesHeader({
  query,
  onPressSearch,
  onClearSearch,
}: SavedPlacesHeaderProps) {
  return (
    <SearchBar
      layout="header"
      onPress={onPressSearch}
      onPressClear={onClearSearch}
      placeholder={SAVED_LIBRARY_SEARCH_PLACEHOLDER}
      value={query ?? ''}
    />
  );
}
