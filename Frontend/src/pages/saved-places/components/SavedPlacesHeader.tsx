import React from 'react';
import {SearchBar} from '../../../components/SearchBar';

type SavedPlacesHeaderProps = {
  onPressSearch: () => void;
};

export function SavedPlacesHeader({onPressSearch}: SavedPlacesHeaderProps) {
  return <SearchBar layout="header" onPress={onPressSearch} />;
}
