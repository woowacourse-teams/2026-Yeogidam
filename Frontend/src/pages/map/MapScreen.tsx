import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { placeMocks } from '../../entities/place/mocks';
import { MapSearchBar } from './components/MapSearchBar';
import { PlaceResultSheet } from './components/PlaceResultSheet';
import KakaoMapNativeComponent from '../../../spec/KakaoMapNativeComponent';

type MapScreenProps = {
  onOpenDetail: () => void;
};

export function MapScreen({ onOpenDetail }: MapScreenProps) {
  const [mapHeight, setMapHeight] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');

  return (
    <View
      style={styles.container}
      onLayout={event => setMapHeight(event.nativeEvent.layout.height)}
    >
      <KakaoMapNativeComponent
        style={styles.map}
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
      <MapSearchBar value={searchKeyword} onChangeText={setSearchKeyword} />
      {mapHeight > 0 ? (
        <PlaceResultSheet
          height={mapHeight}
          places={placeMocks.slice(0, 2)}
          onOpenDetail={() => onOpenDetail()}
        />
      ) : null}
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
