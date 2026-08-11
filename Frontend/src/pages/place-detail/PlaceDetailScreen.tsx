import React from 'react';
import {ScrollView, StyleSheet} from 'react-native';

import {placeMocks} from '../../entities/place/mocks';
import {PlaceDetailHeader} from './components/PlaceDetailHeader';
import {PlaceInfo} from './components/PlaceInfo';
import {PlaceTabs} from './components/PlaceTabs';
import {PlacePostGrid} from './components/PlacePostGrid';

export function PlaceDetailScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <PlaceDetailHeader />
      <PlaceInfo place={placeMocks[0]} />
      <PlaceTabs />
      <PlacePostGrid places={placeMocks} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingBottom: 120,
  },
});
