import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [sheetVisibleHeight, setSheetVisibleHeight] = useState(112);
  const [currentLocationRequestId, setCurrentLocationRequestId] = useState(0);

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
        showsCurrentLocation
        currentLocationRequestId={currentLocationRequestId}
        onMapReady={event => {
          console.log('지도 준비:', event.nativeEvent.ready);
        }}
        onMapError={event => {
          console.error('지도 오류:', event.nativeEvent.message);
        }}
      />
      {!isSheetExpanded ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="내 위치로 이동"
          hitSlop={8}
          onPress={() =>
            setCurrentLocationRequestId(requestId => requestId + 1)
          }
          style={({ pressed }) => [
            styles.currentLocationButton,
            { bottom: sheetVisibleHeight + 16 },
            pressed && styles.currentLocationButtonPressed,
          ]}
        >
          <View style={styles.currentLocationIcon}>
            <View style={styles.currentLocationVerticalLine} />
            <View style={styles.currentLocationHorizontalLine} />
            <View style={styles.currentLocationRing}>
              <View style={styles.currentLocationDot} />
            </View>
          </View>
        </Pressable>
      ) : null}
      {mapHeight > 0 ? (
        <PlaceResultSheet
          height={mapHeight}
          places={placeMocks}
          collapseSignal={collapseSignal}
          onExpandedChange={setIsSheetExpanded}
          onVisibleHeightChange={setSheetVisibleHeight}
          onOpenDetail={() => onOpenDetail()}
        />
      ) : null}
      <MapSearchBar
        value={searchKeyword}
        onChangeText={setSearchKeyword}
        onPressBack={
          isSheetExpanded ? () => setCollapseSignal(signal => signal + 1) : undefined
        }
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
  currentLocationButton: {
    position: 'absolute',
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 6,
  },
  currentLocationButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.96 }],
  },
  currentLocationIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentLocationVerticalLine: {
    position: 'absolute',
    width: 2,
    height: 24,
    borderRadius: 1,
    backgroundColor: '#202124',
  },
  currentLocationHorizontalLine: {
    position: 'absolute',
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#202124',
  },
  currentLocationRing: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#202124',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  currentLocationDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#202124',
  },
});
