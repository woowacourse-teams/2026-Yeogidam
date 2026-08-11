import React, {useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {ScreenHeader} from '../../components/ScreenHeader';
import {savedPlaceMocks} from '../../entities/place/mocks';
import type {Place} from '../../entities/place/types';
import {SavedPlacesEmptyState} from './components/SavedPlacesEmptyState';
import {SavedPlaceGrid} from './components/SavedPlaceGrid';
import {SavedPlacesLinkDialog} from './components/SavedPlacesLinkDialog';

type SavedPlacesScreenProps = {
  onOpenDetail: () => void;
  places?: Place[];
};

export function SavedPlacesScreen({
  onOpenDetail,
  places = savedPlaceMocks,
}: SavedPlacesScreenProps) {
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const hasSavedPlaces = places.length > 0;

  const openDialog = () => {
    setIsDialogVisible(true);
  };

  const closeDialog = () => {
    setIsDialogVisible(false);
    setLinkValue('');
  };

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
          <Pressable onPress={openDialog} style={styles.fab}>
            <Text style={styles.fabText}>＋</Text>
          </Pressable>
        </>
      ) : (
        <SavedPlacesEmptyState />
      )}
      <SavedPlacesLinkDialog
        visible={isDialogVisible}
        value={linkValue}
        onChangeValue={setLinkValue}
        onClose={closeDialog}
        onSubmit={closeDialog}
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
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DBE0F9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3b6fe8',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  fabText: {
    fontSize: 30,
    color: '#000000',
    fontWeight: '300',
  },
});
