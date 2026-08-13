import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import {toSavedPlaceDisplayPlace} from '../../entities/place/api';
import type {Place} from '../../entities/place/types';
import {getSavedPlaces} from '../../entities/info/api';
import type {SavedPlacesApiError} from '../../entities/info/types';
import {SavedPlacesErrorState} from './components/SavedPlacesErrorState';
import {SavedPlacesEmptyState} from './components/SavedPlacesEmptyState';
import {SavedPlaceGrid} from './components/SavedPlaceGrid';
import {SavedPlacesHeader} from './components/SavedPlacesHeader';
import {SavedPlacesLinkDialog} from './components/SavedPlacesLinkDialog';
import {SavedPlacesSearchPanel} from './components/SavedPlacesSearchPanel';

type SavedPlacesScreenProps = {
  onOpenDetail: () => void;
  onAuthenticationRequired?: () => void;
  /** Allows previews/tests to provide a fixed list instead of calling the API. */
  places?: Place[];
};

export function SavedPlacesScreen({
  onOpenDetail,
  onAuthenticationRequired,
  places: providedPlaces,
}: SavedPlacesScreenProps) {
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [places, setPlaces] = useState<Place[]>(providedPlaces ?? []);
  const [error, setError] = useState<SavedPlacesApiError | null>(null);
  const [isLoading, setIsLoading] = useState(providedPlaces === undefined);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasSavedPlaces = places.length > 0;

  const loadSavedPlaces = useCallback(async () => {
    if (providedPlaces !== undefined) {
      setPlaces(providedPlaces);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const savedPlaces = await getSavedPlaces();
      setPlaces(savedPlaces.map(toSavedPlaceDisplayPlace));
    } catch (nextError) {
      const apiError = nextError as SavedPlacesApiError;
      setError(apiError);
      if (apiError.errorCode === 'AUTH401_001') {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsLoading(false);
    }
  }, [onAuthenticationRequired, providedPlaces]);

  useEffect(() => {
    loadSavedPlaces();
  }, [loadSavedPlaces]);

  const openDialog = () => {
    setIsDialogVisible(true);
  };

  const closeDialog = () => {
    setIsDialogVisible(false);
    setLinkValue('');
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({y: 0, animated: true});
  };

  return (
    <View style={styles.container}>
      {isSearchOpen ? (
        <>
          <SavedPlacesSearchPanel
            places={places}
            onCloseSearch={() => setIsSearchOpen(false)}
            onPressPlace={() => onOpenDetail()}
          />
          {hasSavedPlaces ? (
            <Pressable onPress={openDialog} style={styles.fabShadow}>
              <View style={styles.fab}>
                <Text style={styles.fabText}>＋</Text>
              </View>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <SavedPlacesHeader onPressSearch={() => setIsSearchOpen(true)} />
          <View style={styles.divider} />
          {error && hasSavedPlaces ? (
            <View style={styles.errorBanner}>
              <Text numberOfLines={1} style={styles.errorText}>{error.message}</Text>
              {error.retryable ? (
                <Pressable onPress={loadSavedPlaces}>
                  <Text style={styles.errorRetryText}>재시도</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {isLoading && !hasSavedPlaces ? (
            <View style={styles.loading}><Text>저장한 장소를 불러오는 중이에요.</Text></View>
          ) : hasSavedPlaces ? (
            <>
              <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false}>
                <SavedPlaceGrid
                  places={places}
                  onPressPlace={() => onOpenDetail()}
                />
                <View style={styles.scrollFooter}>
                  <Pressable onPress={scrollToTop} style={styles.scrollTopButton}>
                    <MaterialIcons color="#8FA2FF" name="upload" size={24} />
                  </Pressable>
                </View>
              </ScrollView>
              <Pressable onPress={openDialog} style={styles.fabShadow}>
                <View style={styles.fab}>
                  <Text style={styles.fabText}>＋</Text>
                </View>
              </Pressable>
            </>
          ) : error ? (
            <SavedPlacesErrorState error={error} onRetry={loadSavedPlaces} />
          ) : (
            <SavedPlacesEmptyState />
          )}
        </>
      )}
      <SavedPlacesLinkDialog
        visible={isDialogVisible}
        value={linkValue}
        onChangeValue={setLinkValue}
        onClose={closeDialog}
        onSubmit={() => {
          closeDialog();
          // Re-fetch after the reel/link processing flow has completed.
          loadSavedPlaces();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e5ea',
    marginHorizontal: 24,
  },
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#fff5f5',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  errorText: {flex: 1, color: '#7c2d2d', fontSize: 13},
  errorRetryText: {color: '#5c6fc8', fontSize: 13, fontWeight: '700'},
  fabShadow: {
    position: 'absolute',
    right: 18,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowRadius: 14,
    elevation: 6,
  },
  fab: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(219, 224, 249, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: {
    fontSize: 30,
    color: '#000000',
    fontWeight: '300',
  },
  scrollFooter: {
    alignItems: 'center',
    paddingBottom: 104,
  },
  scrollTopButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DBE0F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
