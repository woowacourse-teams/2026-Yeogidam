import React from 'react';
import {ImageBackground, StyleSheet, View} from 'react-native';
import type {DimensionValue} from 'react-native';

import {placeMocks} from '../../entities/place/mocks';
import {MapSearchBar} from './components/MapSearchBar';
import {PlaceMarker} from './components/PlaceMarker';
import {PlaceResultSheet} from './components/PlaceResultSheet';

type MapScreenProps = {
  onOpenDetail: () => void;
};

const markerPositions: Array<{left: DimensionValue; top: DimensionValue}> = [
  {left: '64%', top: '37%'},
  {left: '20%', top: '58%'},
  {left: '72%', top: '55%'},
];

export function MapScreen({onOpenDetail}: MapScreenProps) {
  return (
    <View style={styles.container}>
      <ImageBackground
        source={require('../../assets/maps/map-background.png')}
        style={styles.map}
        imageStyle={styles.mapImage}>
        <MapSearchBar keyword="우테코" />
        <PlaceMarker
          label="카페 온월"
          left="39%"
          top="31%"
          selected={true}
        />
        {markerPositions.map(position => (
          <PlaceMarker
            key={`${position.left}-${position.top}`}
            left={position.left}
            top={position.top}
          />
        ))}
      </ImageBackground>
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
