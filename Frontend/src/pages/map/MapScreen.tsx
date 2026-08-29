import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BOTTOM_TAB_BAR_HEIGHT } from '../../components/BottomTabBar';
import { toSavedPlaceDisplayPlace } from '../../entities/place/api';
import type { Place } from '../../entities/place/types';
import { getSavedPlaces } from '../../entities/info/api';
import { MapSearchBar } from './components/MapSearchBar';
import {
  COLLAPSED_SHEET_HEIGHT,
  PlaceResultSheet,
} from './components/PlaceResultSheet';
import KakaoMapNativeComponent from '../../../spec/KakaoMapNativeComponent';

type MapScreenProps = {
  onDetailViewChange?: (isDetailView: boolean) => void;
  onAuthenticationRequired?: () => void;
};

type MapCamera = {
  latitude: number;
  longitude: number;
  zoomLevel: number;
};

export function MapScreen({
  onDetailViewChange,
  onAuthenticationRequired,
}: MapScreenProps) {
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const [mapHeight, setMapHeight] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchedPlaces, setSearchedPlaces] = useState<Place[] | null>(null);
  const [searchResultSignal, setSearchResultSignal] = useState(0);
  const [mapCenter, setMapCenter] = useState({
    latitude: 37.5448,
    longitude: 127.0557,
  });
  const [mapZoomLevel, setMapZoomLevel] = useState(14);
  const lastMapCameraRef = useRef<MapCamera>({
    latitude: 37.5448,
    longitude: 127.0557,
    zoomLevel: 14,
  });
  const detailEntryCameraRef = useRef<MapCamera | null>(null);
  const [cameraMoveRequestId, setCameraMoveRequestId] = useState(0);
  const [isPlaceDetailVisible, setIsPlaceDetailVisible] = useState(false);
  const [openedMarker, setOpenedMarker] = useState({ id: '', signal: 0 });
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [sheetVisibleHeight, setSheetVisibleHeight] = useState(
    COLLAPSED_SHEET_HEIGHT,
  );
  const [currentLocationRequestId, setCurrentLocationRequestId] = useState(0);
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]);
  const bottomNavigationOffset = BOTTOM_TAB_BAR_HEIGHT + bottomInset;
  const mapBottomOffset = isPlaceDetailVisible ? 0 : bottomNavigationOffset;
  const [visibleBounds, setVisibleBounds] = useState<{
    southLatitude: number;
    northLatitude: number;
    westLongitude: number;
    eastLongitude: number;
  } | null>(null);
  useEffect(() => {
    let isActive = true;

    getSavedPlaces()
      .then(savedPlaceItems => {
        if (!isActive) return;

        setSavedPlaces(
          Array.from(
            new Map(
              savedPlaceItems
                .map(toSavedPlaceDisplayPlace)
                .map(place => [place.id, place]),
            ).values(),
          ),
        );
      })
      .catch(error => {
        if (isActive) {
          setMapMessage(error.message ?? '저장한 장소를 불러오지 못했어요.');
        }
      });

    return () => {
      isActive = false;
    };
  }, []);
  const placesWithCoordinates = useMemo(
    () =>
      savedPlaces.filter(
        place => place.latitude !== undefined && place.longitude !== undefined,
      ),
    [savedPlaces],
  );
  const visiblePlaces = useMemo(() => {
    if (!visibleBounds) {
      return [];
    }

    return placesWithCoordinates.filter(
      place =>
        place.latitude !== undefined &&
        place.longitude !== undefined &&
        place.latitude >= visibleBounds.southLatitude &&
        place.latitude <= visibleBounds.northLatitude &&
        place.longitude >= visibleBounds.westLongitude &&
        place.longitude <= visibleBounds.eastLongitude,
    );
  }, [placesWithCoordinates, visibleBounds]);
  const resultPlaces = searchedPlaces ?? visiblePlaces;
  const hasActiveSearch = searchKeyword.trim().length > 0;
  const markerPlaces = searchedPlaces ?? placesWithCoordinates;

  const handleSheetVisibleHeightChange = useCallback((height: number) => {
    setSheetVisibleHeight(currentHeight =>
      currentHeight === height ? currentHeight : height,
    );

    // The sheet can cover a different part of the map before the native map
    // reports its new camera bounds. Do not keep rendering the previous area's
    // results during that short interval.
    if (!searchedPlaces) {
      setVisibleBounds(null);
    }
  }, [searchedPlaces]);

  const handleSearch = () => {
    const keyword = searchKeyword.trim();
    if (!keyword) return;

    const normalizedKeyword = keyword
      .toLocaleLowerCase('ko-KR')
      .replace(/\s+/g, '');
    const places = placesWithCoordinates.filter(place =>
      [place.name, place.category, place.address, place.fullAddress]
        .filter((value): value is string => Boolean(value))
        .some(value =>
          value
            .toLocaleLowerCase('ko-KR')
            .replace(/\s+/g, '')
            .includes(normalizedKeyword),
        ),
    );

    setSearchedPlaces(places);
    setSearchResultSignal(signal => signal + 1);
    if (
      places[0]?.latitude !== undefined &&
      places[0]?.longitude !== undefined
    ) {
      setMapCenter({
        latitude: places[0].latitude,
        longitude: places[0].longitude,
      });
      setMapZoomLevel(16);
    }
  };

  const handleSearchKeywordChange = (value: string) => {
    setSearchKeyword(value);
    if (!value.trim()) {
      setSearchedPlaces(null);
    }
  };
  const handleSearchBack = () => {
    if (hasActiveSearch) {
      setSearchKeyword('');
      setSearchedPlaces(null);
      setIsSearchFocused(false);
      Keyboard.dismiss();
      return;
    }

    if (isSearchFocused) {
      setIsSearchFocused(false);
      Keyboard.dismiss();
      return;
    }

    if (isSheetExpanded) {
      setCollapseSignal(signal => signal + 1);
    }
  };

  return (
    <View
      style={styles.container}
      onLayout={event => setMapHeight(event.nativeEvent.layout.height)}
    >
      <View style={[styles.mapStage, { marginBottom: mapBottomOffset }]}>
        <View style={styles.mapViewport}>
          {mapHeight > 0 ? (
            <KakaoMapNativeComponent
              style={styles.map}
              latitude={mapCenter.latitude}
              longitude={mapCenter.longitude}
              zoomLevel={mapZoomLevel}
              cameraMoveRequestId={cameraMoveRequestId}
              cameraBottomInset={isSheetExpanded ? 0 : sheetVisibleHeight}
              savedPlacesJson={JSON.stringify(
                markerPlaces.map(({ id, name, latitude, longitude }) => ({
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
              onMarkerPressed={event => {
                const place = markerPlaces.find(
                  candidate => candidate.id === event.nativeEvent.id,
                );
                if (!place) return;

                if (
                  place.latitude !== undefined &&
                  place.longitude !== undefined
                ) {
                  detailEntryCameraRef.current = lastMapCameraRef.current;
                  setMapCenter({
                    latitude: place.latitude,
                    longitude: place.longitude,
                  });
                  setMapZoomLevel(17);
                }

                setOpenedMarker(current => ({
                  id: place.id,
                  signal: current.signal + 1,
                }));
              }}
              onCameraChanged={event => {
                const {
                  latitude,
                  longitude,
                  zoomLevel,
                  southLatitude,
                  northLatitude,
                  westLongitude,
                  eastLongitude,
                } = event.nativeEvent;

                // Native sends an inverted range while a camera gesture is
                // active. Clear the old area immediately; the final, valid
                // range arrives once the gesture stops.
                if (
                  southLatitude > northLatitude ||
                  westLongitude > eastLongitude
                ) {
                  setVisibleBounds(null);
                  return;
                }
                lastMapCameraRef.current = { latitude, longitude, zoomLevel };
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
            height={mapHeight - mapBottomOffset}
            topInset={topInset}
            bottomTabOffset={bottomNavigationOffset}
            places={resultPlaces}
            isSearchActive={hasActiveSearch}
            expandSignal={searchResultSignal}
            openPlaceId={openedMarker.id}
            openPlaceSignal={openedMarker.signal}
            onPlaceSelected={place => {
              if (place.latitude === undefined || place.longitude === undefined) {
                return;
              }

              detailEntryCameraRef.current = lastMapCameraRef.current;
              setMapCenter({
                latitude: place.latitude,
                longitude: place.longitude,
              });
              setMapZoomLevel(17);
              // A map can have been panned after the same coordinates were set.
              // Incrementing this signal makes selecting that place recentre it.
              setCameraMoveRequestId(requestId => requestId + 1);
            }}
            onPlaceDetailBack={() => {
              const entryCamera = detailEntryCameraRef.current;
              detailEntryCameraRef.current = null;
              if (!entryCamera) return;

              setMapCenter({
                latitude: entryCamera.latitude,
                longitude: entryCamera.longitude,
              });
              setMapZoomLevel(entryCamera.zoomLevel);
              setCameraMoveRequestId(requestId => requestId + 1);
            }}
            collapseSignal={collapseSignal}
            onDetailViewChange={isDetailView => {
              setIsPlaceDetailVisible(isDetailView);
              onDetailViewChange?.(isDetailView);
            }}
            onAuthenticationRequired={onAuthenticationRequired}
            onSavedPlaceDeleted={savedPlaceId => {
              setSavedPlaces(current =>
                current.filter(place => place.savedPlaceId !== savedPlaceId),
              );
            }}
            onExpandedChange={setIsSheetExpanded}
            onVisibleHeightChange={handleSheetVisibleHeightChange}
            isVisibleAreaUpdating={!hasActiveSearch && visibleBounds === null}
          />
        ) : null}
        {!isPlaceDetailVisible ? (
          <MapSearchBar
            backButtonPosition={
              hasActiveSearch || isSearchFocused ? 'leading' : 'inside'
            }
            value={searchKeyword}
            onChangeText={handleSearchKeywordChange}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            onSubmitEditing={handleSearch}
            onPressSearchAction={handleSearch}
            topInset={topInset}
            onPressBack={
              hasActiveSearch || isSearchFocused || isSheetExpanded
                ? handleSearchBack
                : undefined
            }
          />
        ) : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  mapStage: {
    flex: 1,
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
