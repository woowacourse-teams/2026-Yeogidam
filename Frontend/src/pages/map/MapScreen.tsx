import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import type { DimensionValue } from 'react-native';

import { placeMocks } from '../../entities/place/mocks';
import { MapSearchBar } from './components/MapSearchBar';
import { PlaceMarker } from './components/PlaceMarker';
import { PlaceResultSheet } from './components/PlaceResultSheet';
import KakaoMapNativeComponent from '../../../spec/KakaoMapNativeComponent';

type MapScreenProps = {
  onOpenDetail: () => void;
};

const markerPositions: Array<{ left: DimensionValue; top: DimensionValue }> = [
  { left: '64%', top: '37%' },
  { left: '20%', top: '58%' },
  { left: '72%', top: '55%' },
];

export function MapScreen({ onOpenDetail }: MapScreenProps) {
  return (
    <View style={styles.container}>
      <KakaoMapNativeComponent
        style={{ flex: 1 }}
        latitude={37.5665}
        longitude={126.978}
        zoomLevel={15}
        onMapReady={event => {
          console.log('지도 준비:', event.nativeEvent.ready);
        }}
        onMapError={event => {
          console.error('지도 오류:', event.nativeEvent.message);
        }}
      />
      <PlaceResultSheet
        places={placeMocks.slice(0, 2)}
        onOpenDetail={() => onOpenDetail()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  map: {
    flex: 1,
  },
  mapImage: {
    resizeMode: 'cover',
  },
});
