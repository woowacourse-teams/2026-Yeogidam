import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { savedPlaceMocks } from '../../entities/place/mocks';
import { MapSearchBar } from './components/MapSearchBar';
import {
  COLLAPSED_SHEET_HEIGHT,
  PlaceResultSheet,
} from './components/PlaceResultSheet';
import KakaoMapNativeComponent from '../../../spec/KakaoMapNativeComponent';

type MapScreenProps = {
  onOpenDetail: () => void;
};

export function MapScreen({ onOpenDetail }: MapScreenProps) {
  const { top: topInset } = useSafeAreaInsets();
  const [mapHeight, setMapHeight] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [sheetVisibleHeight, setSheetVisibleHeight] = useState(
    COLLAPSED_SHEET_HEIGHT,
  );
  const [currentLocationRequestId, setCurrentLocationRequestId] = useState(0);
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const [visibleBounds, setVisibleBounds] = useState<{
    southLatitude: number;
    northLatitude: number;
    westLongitude: number;
    eastLongitude: number;
  } | null>(null);
  const savedPlaces = useMemo(
    () =>
      Array.from(
        new Map(savedPlaceMocks.map(place => [place.id, place])).values(),
      ),
    [],
  );
  const visiblePlaces = useMemo(() => {
    if (!visibleBounds) {
      return [];
    }

    return savedPlaces.filter(
      place =>
        place.latitude >= visibleBounds.southLatitude &&
        place.latitude <= visibleBounds.northLatitude &&
        place.longitude >= visibleBounds.westLongitude &&
        place.longitude <= visibleBounds.eastLongitude,
    );
  }, [savedPlaces, visibleBounds]);

  return (
    <View
      style={styles.container}
      onLayout={event => setMapHeight(event.nativeEvent.layout.height)}
    >
      <View style={styles.mapViewport}>
        {mapHeight > 0 ? (
          <KakaoMapNativeComponent
            style={styles.map}
            latitude={37.5448}
            longitude={127.0557}
            zoomLevel={14}
            cameraBottomInset={isSheetExpanded ? 0 : sheetVisibleHeight}
            savedPlacesJson={JSON.stringify(
              savedPlaces.map(({ id, name, latitude, longitude }) => ({
                id,
                name,
                latitude,
                longitude,
              })),
            )}
            showsCurrentLocation
            currentLocationRequestId={currentLocationRequestId}
            onMapReady={event => {
              console.log('지도 준비:', event.nativeEvent.ready);
            }}
            onMapError={event => {
              setMapMessage(event.nativeEvent.message);
            }}
            onCameraChanged={event => {
              const {
                southLatitude,
                northLatitude,
                westLongitude,
                eastLongitude,
              } = event.nativeEvent;
              setVisibleBounds({
                southLatitude,
                northLatitude,
                westLongitude,
                eastLongitude,
              });
            }}
          />
        ) : null}
      </View>
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
          topInset={topInset}
          places={visiblePlaces}
          collapseSignal={collapseSignal}
          onExpandedChange={setIsSheetExpanded}
          onVisibleHeightChange={setSheetVisibleHeight}
          onOpenDetail={() => onOpenDetail()}
        />
      ) : null}
      <MapSearchBar
        value={searchKeyword}
        onChangeText={setSearchKeyword}
        topInset={topInset}
        onPressBack={
          isSheetExpanded
            ? () => setCollapseSignal(signal => signal + 1)
            : undefined
        }
      />
      {mapMessage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="안내 닫기"
          onPress={() => setMapMessage(null)}
          style={[styles.mapMessage, { top: topInset + 72 }]}
        >
          <Text style={styles.mapMessageText}>{mapMessage}</Text>
        </Pressable>
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
  mapViewport: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  mapMessage: {
    position: 'absolute',
    left: 24,
    right: 24,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(32, 33, 36, 0.9)',
  },
  mapMessageText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
