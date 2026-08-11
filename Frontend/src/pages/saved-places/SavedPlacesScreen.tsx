import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

import {ScreenHeader} from '../../components/ScreenHeader';
import {savedPlaceMocks} from '../../entities/place/mocks';
import type {Place} from '../../entities/place/types';
import {SavedPlacesEmptyState} from './components/SavedPlacesEmptyState';
import {SavedPlaceGrid} from './components/SavedPlaceGrid';

type SavedPlacesScreenProps = {
  onOpenDetail: () => void;
  places?: Place[];
};

export function SavedPlacesScreen({
  onOpenDetail,
  places = savedPlaceMocks,
}: SavedPlacesScreenProps) {
  const hasSavedPlaces = places.length > 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="저장한 장소" />
      <View style={styles.divider} />
      {hasSavedPlaces ? (
        <>
          <ScrollView showsVerticalScrollIndicator={false}>
            <SavedPlaceGrid
              places={places}
              onPressPlace={() => onOpenDetail()}
            />
          </ScrollView>
          <View style={styles.fab}>
            <Text style={styles.fabText}>＋</Text>
          </View>
        </>
      ) : (
        <SavedPlacesEmptyState />
      )}
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
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#dbe0f9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3b6fe8',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  fabText: {
    fontSize: 30,
    color: '#ffffff',
    fontWeight: '300',
  },
});
