import React from 'react';
import {SearchBar} from '../../../components/SearchBar';

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
      value={query ?? ''}
    />
  );
}
