import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import type {SavedPlacesSearchMethod} from '../../../analytics/savedPlaceEvents';
import {SearchBar} from '../../../components/SearchBar';
import {SAVED_LIBRARY_SEARCH_PLACEHOLDER} from './SavedPlacesHeader';

type SavedPlacesSearchPanelProps = {
  initialQuery: string;
  recentSearches: string[];
  onCloseSearch: () => void;
  /** 검색어를 확정하면 패널을 닫고 보관함 화면에서 결과를 보여 줍니다. */
  onSubmitSearch: (query: string, method: SavedPlacesSearchMethod) => void;
};

export function SavedPlacesSearchPanel({
  initialQuery,
  recentSearches,
  onCloseSearch,
  onSubmitSearch,
}: SavedPlacesSearchPanelProps) {
  const [query, setQuery] = useState(initialQuery);

  const submitSearch = () => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      onCloseSearch();
      return;
    }
    onSubmitSearch(nextQuery, 'keyboard');
  };

  return (
    <View style={styles.container}>
      <SearchBar
        autoCorrect={false}
        autoFocus
        backButtonPosition="leading"
        layout="embedded"
        onChangeText={setQuery}
        onPressBack={onCloseSearch}
        onPressSearchAction={submitSearch}
        onSubmitEditing={submitSearch}
        placeholder={SAVED_LIBRARY_SEARCH_PLACEHOLDER}
        value={query}
      />
      <View style={styles.historySection}>
        <Text style={styles.historyTitle}>검색 기록</Text>
        {recentSearches.length > 0 ? (
          recentSearches.map(item => (
            <Pressable
              key={item}
              onPress={() => onSubmitSearch(item, 'recent_search')}
              style={styles.historyItem}>
              <View style={styles.historyLeft}>
                <View style={styles.historyIconWrap}>
                  <MaterialIcons color="#d8dffe" name="access-time" size={20} />
                </View>
                <Text style={styles.historyText}>{item}</Text>
              </View>
              <MaterialIcons color="#c8c9d2" name="chevron-right" size={24} />
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyHistoryText}>아직 검색 기록이 없어요.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  historySection: {
    paddingTop: 24,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#a4a5b0',
    paddingHorizontal: 24,
    marginBottom: 10,
  },
  historyItem: {
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#ececf1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f4f6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyText: {
    fontSize: 16,
    color: '#2b2d43',
  },
  emptyHistoryText: {
    fontSize: 14,
    color: '#9c9daa',
    paddingHorizontal: 24,
    paddingTop: 4,
  },
});
