import React, {useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';

import {savedPlaceMocks} from '../../entities/place/mocks';
import type {Place} from '../../entities/place/types';
import {SavedPlacesEmptyState} from './components/SavedPlacesEmptyState';
import {SavedPlaceGrid} from './components/SavedPlaceGrid';
import {SavedPlacesHeader} from './components/SavedPlacesHeader';
import {SavedPlacesLinkDialog} from './components/SavedPlacesLinkDialog';
import {SavedPlacesSearchPanel} from './components/SavedPlacesSearchPanel';

type SavedPlacesScreenProps = {
  onOpenDetail: () => void;
  places?: Place[];
};

export function SavedPlacesScreen({
  onOpenDetail,
  places = savedPlaceMocks,
}: SavedPlacesScreenProps) {
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);
  const hasSavedPlaces = places.length > 0;

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
          {hasSavedPlaces ? (
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
