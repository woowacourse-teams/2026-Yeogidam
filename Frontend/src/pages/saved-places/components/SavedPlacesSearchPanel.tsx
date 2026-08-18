import React, {useMemo, useState} from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import type {Place} from '../../../entities/place/types';
import {MapSearchBar} from '../../map/components/MapSearchBar';

type SavedPlacesSearchPanelProps = {
  places: Place[];
  recentSearches: string[];
  onCloseSearch: () => void;
  onPressPlace: (place: Place) => void;
  onSaveSearchTerm: (value: string) => void;
};

export function SavedPlacesSearchPanel({
  places,
  recentSearches,
  onCloseSearch,
  onPressPlace,
  onSaveSearchTerm,
}: SavedPlacesSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const normalizedQuery = submittedQuery.trim().toLowerCase();
  const filteredPlaces = useMemo(() => {
    if (!normalizedQuery) {
      return [];
    }

    return places.filter(place => {
      const fields = [place.name, place.address, place.fullAddress].map(value =>
        value.toLowerCase(),
      );

      return fields.some(value => value.includes(normalizedQuery));
    });
  }, [normalizedQuery, places]);

  const submitSearch = () => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      onCloseSearch();
      return;
    }

    setSubmittedQuery(nextQuery);
    onSaveSearchTerm(nextQuery);
  };

  const selectRecentSearch = (value: string) => {
    setQuery(value);
    setSubmittedQuery(value);
    onSaveSearchTerm(value);
  };

  const showResults = submittedQuery.trim().length > 0;

  return (
    <View style={styles.container}>
      <MapSearchBar
        autoCorrect={false}
        autoFocus
        backButtonPosition="leading"
        embedded
        onChangeText={value => {
          setQuery(value);
          setSubmittedQuery('');
        }}
        onPressBack={onCloseSearch}
        onPressSearchAction={submitSearch}
        onSubmitEditing={submitSearch}
        placeholder="입력하세요."
        value={query}
      />
      {showResults ? (
        <ScrollView
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {filteredPlaces.length > 0 ? (
            <View style={styles.resultsGrid}>
              {filteredPlaces.map(place => (
                <View key={place.id} style={styles.resultCard}>
                  <Pressable
                    onPress={() => onPressPlace(place)}
                    style={styles.resultCardBody}>
                    {place.image ? (
                      <Image source={place.image} style={styles.resultImage} />
                    ) : (
                      <View
                        style={[styles.resultImage, styles.resultImagePlaceholder]}
                      />
                    )}
                    <LinearGradient
                      colors={[
                        'rgba(0, 0, 0, 0)',
                        'rgba(0, 0, 0, 0.22)',
                        'rgba(0, 0, 0, 0.58)',
                        'rgba(0, 0, 0, 0.86)',
                      ]}
                      locations={[0, 0.38, 0.72, 1]}
                      pointerEvents="none"
                      style={styles.resultDim}
                    />
                    <View style={styles.resultImageOverlay}>
                      <Text style={styles.resultName}>{place.name}</Text>
                      <Text style={styles.resultAddress}>{place.address}</Text>
                    </View>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyResult}>
              <Text style={styles.emptyResultTitle}>검색 결과가 없어요</Text>
              <Text style={styles.emptyResultText}>
                다른 키워드로 다시 검색해보세요.
              </Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.historySection}>
          <Text style={styles.historyTitle}>검색 기록</Text>
          {recentSearches.length > 0 ? (
            recentSearches.map(item => (
              <Pressable
                key={item}
                onPress={() => selectRecentSearch(item)}
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
      )}
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
  resultsContent: {
    padding: 12,
    paddingTop: 18,
    paddingBottom: 130,
  },
  resultsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  resultCard: {
    width: '48.5%',
    height: 248,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#eeeeee',
  },
  resultCardBody: {
    flex: 1,
  },
  resultImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  resultImagePlaceholder: {
    backgroundColor: '#d8dffe',
  },
  resultDim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
  },
  resultImageOverlay: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  resultName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
  },
  resultAddress: {
    fontSize: 10,
    color: '#ffffff',
    marginTop: 2,
  },
  emptyResult: {
    paddingTop: 56,
    alignItems: 'center',
  },
  emptyResultTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2b2d43',
  },
  emptyResultText: {
    fontSize: 14,
    color: '#9c9daa',
    marginTop: 8,
  },
});
