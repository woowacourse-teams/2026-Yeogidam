import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePostHog } from 'posthog-react-native';
import { v4 as uuidv4 } from 'uuid';

import {
  captureSavedPlaceSelected,
  type SavedPlaceViewContext,
} from '../../analytics/savedPlaceEvents';
import {
  BOTTOM_NAVIGATION_BAR_HEIGHT,
  getBottomNavigationBarOffset,
} from '../../components/BottomNavigationBar';
import { toSavedPlaceDisplayPlace } from '../../entities/place/api';
import type { Place } from '../../entities/place/types';
import {
  ONBOARDING_MAP_CENTER,
} from '../../entities/onboarding/data';
import { getSavedPlaces } from '../../entities/info/api';
import {
  SEARCH_BAR_HEIGHT,
  SEARCH_BAR_TOP_GAP,
  SearchBar,
} from '../../components/SearchBar';
import {
  COLLAPSED_SHEET_HEIGHT,
  PlaceResultSheet,
  type MapSheetPage,
} from './components/PlaceResultSheet';
import KakaoMapNativeComponent from '../../../spec/KakaoMapNativeComponent';

import {
  checkLocationPermission,
  ensureLocationPermission,
  subscribeLocationPermission,
} from '../../lib/location-permission';

import type { BackGestureRegion } from '../../components/navigation/SwipeBackStack';

type MapScreenProps = {
  bottomNavigationBar?: React.ReactNode;
  onBackGestureRegionChange?: (region: BackGestureRegion) => void;
  isActive?: boolean;
  isGuest?: boolean;
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
  onNestedBackStateChange?: (canGoBack: boolean) => void;
  onAuthenticationRequired?: () => void;
  onShowGuestLoginPrompt?: () => void;
};

type MapCamera = {
  latitude: number;
  longitude: number;
  zoomLevel: number;
  bottomInset: number;
};

export function MapScreen({
  bottomNavigationBar,
  onBackGestureRegionChange,
  isActive = true,
  isGuest = false,
  onDeleteGuestPlaces,
  onNestedBackStateChange,
  onAuthenticationRequired,
  onShowGuestLoginPrompt,
}: MapScreenProps) {
  const posthog = usePostHog();
  const [locationGranted, setLocationGranted] = useState(false);
  const didRequestInitialCurrentLocation = useRef(false);
  useEffect(() => {
    const unsubscribe = subscribeLocationPermission(setLocationGranted);
    const refresh = () => {
      checkLocationPermission().catch(error =>
        console.warn('위치 권한 확인 실패', error),
      );
    };
    refresh();
    return () => {
      unsubscribe();
    };
  }, []);
  const handleCurrentLocation = async () => {
    try {
      if (await ensureLocationPermission())
        setCurrentLocationRequestId(requestId => requestId + 1);
    } catch {
      setMapMessage('위치 권한을 확인하지 못했어요. 다시 시도해 주세요.');
    }
  };
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const [mapHeight, setMapHeight] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchedPlaces, setSearchedPlaces] = useState<Place[] | null>(null);
  const [searchResultSignal, setSearchResultSignal] = useState(0);
  const [backToPlaceListSignal, setBackToPlaceListSignal] = useState(0);
  const [detailMoreSignal, setDetailMoreSignal] = useState(0);
  const [mapCenter, setMapCenter] = useState(
    isGuest
      ? ONBOARDING_MAP_CENTER
      : { latitude: 37.5448, longitude: 127.0557 },
  );
  const [mapZoomLevel, setMapZoomLevel] = useState(14);
  const lastMapCameraRef = useRef<MapCamera>({
    ...mapCenter,
    zoomLevel: mapZoomLevel,
    bottomInset: 0,
  });
  // 같은 좌표로 다시 검색해도 카메라가 움직이도록 요청 번호를 올립니다.
  const [cameraMoveRequestId, setCameraMoveRequestId] = useState(0);
  const [cameraFitRequestId, setCameraFitRequestId] = useState(0);
  const [isPlaceDetailVisible, setIsPlaceDetailVisible] = useState(false);
  const [openedMarker, setOpenedMarker] = useState<{
    place: Place | null;
    viewContext: SavedPlaceViewContext | null;
    camera: MapCamera | null;
    signal: number;
  }>({ place: null, viewContext: null, camera: null, signal: 0 });
  const handleDetailViewChange = useCallback((isDetailView: boolean) => {
    setIsPlaceDetailVisible(isDetailView);
    if (!isDetailView) {
      setOpenedMarker(current =>
        current.camera ? { ...current, camera: null } : current,
      );
    }
  }, []);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const detailHeaderProgress = useRef(new Animated.Value(0)).current;
  const listHeaderProgress = useRef(new Animated.Value(0)).current;
  const detailCameraRef = useRef<MapCamera | null>(null);
  if (!isPlaceDetailVisible) detailCameraRef.current = null;
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [mapPanCollapseSignal, setMapPanCollapseSignal] = useState(0);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const [currentLocationRequestId, setCurrentLocationRequestId] = useState(0);

  useEffect(() => {
    if (
      isGuest ||
      !locationGranted ||
      didRequestInitialCurrentLocation.current
    ) {
      return;
    }

    didRequestInitialCurrentLocation.current = true;
    setCurrentLocationRequestId(requestId => requestId + 1);
  }, [isGuest, locationGranted]);
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]);
  const [isSavedPlacesLoading, setIsSavedPlacesLoading] = useState(true);
  const [savedPlacesLoadFailed, setSavedPlacesLoadFailed] = useState(false);
  const bottomNavigationOffset =
    BOTTOM_NAVIGATION_BAR_HEIGHT + getBottomNavigationBarOffset(bottomInset);

  const [visibleBounds, setVisibleBounds] = useState<{
    southLatitude: number;
    northLatitude: number;
    westLongitude: number;
    eastLongitude: number;
  } | null>(null);
  useEffect(() => {
    if (isGuest) {
      setSavedPlaces([]);
      setSavedPlacesLoadFailed(false);
      setIsSavedPlacesLoading(false);
      return;
    }
    let isMounted = true;

    getSavedPlaces()
      .then(savedPlaceItems => {
        if (!isMounted) return;

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
        if (isMounted) {
          setSavedPlacesLoadFailed(true);
          setMapMessage(error.message ?? '저장한 장소를 불러오지 못했어요.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsSavedPlacesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isGuest]);
  const placesWithCoordinates = useMemo(
    () =>
      savedPlaces.filter(
        place => place.latitude !== undefined && place.longitude !== undefined,
      ),
    [savedPlaces],
  );
  const hasActiveSearch = searchKeyword.trim().length > 0;
  const resultPlaces = useMemo(() => {
    const candidatePlaces = searchedPlaces ?? placesWithCoordinates;
    if (!visibleBounds) return [];

    return candidatePlaces.filter(
      place =>
        place.latitude !== undefined &&
        place.longitude !== undefined &&
        place.latitude >= visibleBounds.southLatitude &&
        place.latitude <= visibleBounds.northLatitude &&
        place.longitude >= visibleBounds.westLongitude &&
        place.longitude <= visibleBounds.eastLongitude,
    );
  }, [placesWithCoordinates, searchedPlaces, visibleBounds]);
  const markerPlaces = searchedPlaces ?? placesWithCoordinates;
  const showExpandedDetailHeader = isPlaceDetailVisible && isSheetExpanded;

  useLayoutEffect(() => {
    detailHeaderProgress.setValue(showExpandedDetailHeader ? 1 : 0);
  }, [detailHeaderProgress, showExpandedDetailHeader]);
  const cameraFitPointsJson = useMemo(
    () =>
      JSON.stringify(
        (searchedPlaces ?? []).map(({ latitude, longitude }) => ({
          latitude,
          longitude,
        })),
      ),
    [searchedPlaces],
  );

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
    if (places.length >= 2) {
      setCameraFitRequestId(requestId => requestId + 1);
    } else if (
      places[0]?.latitude !== undefined &&
      places[0]?.longitude !== undefined
    ) {
      setMapCenter({
        latitude: places[0].latitude,
        longitude: places[0].longitude,
      });
      setMapZoomLevel(16);
      setCameraMoveRequestId(requestId => requestId + 1);
    }
  };

  const handleSearchKeywordChange = (value: string) => {
    setSearchKeyword(value);
    if (!value.trim()) {
      setSearchedPlaces(null);
    }
  };
  const handleSearchBack = useCallback(() => {
    if (isPlaceDetailVisible) {
      setBackToPlaceListSignal(signal => signal + 1);
      setIsSearchFocused(false);
      Keyboard.dismiss();
      return;
    }

    if (isSheetExpanded) {
      setCollapseSignal(signal => signal + 1);
      setIsSearchFocused(false);
      Keyboard.dismiss();
      return;
    }

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
    }
  }, [hasActiveSearch, isPlaceDetailVisible, isSearchFocused, isSheetExpanded]);

  useEffect(() => {
    const hasSearchBackState =
      isActive &&
      (isPlaceDetailVisible ||
        isSheetExpanded ||
        hasActiveSearch ||
        isSearchFocused);
    onNestedBackStateChange?.(hasSearchBackState);
    if (Platform.OS !== 'android' || !hasSearchBackState) {
      return () => onNestedBackStateChange?.(false);
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        handleSearchBack();
        return true;
      },
    );

    return () => {
      subscription.remove();
      onNestedBackStateChange?.(false);
    };
  }, [
    handleSearchBack,
    isActive,
    hasActiveSearch,
    isPlaceDetailVisible,
    isSearchFocused,
    isSheetExpanded,
    onNestedBackStateChange,
  ]);

  const renderMap = (page: MapSheetPage) => {
    if (page.isDetail && !detailCameraRef.current) {
      // Keep the map padding unchanged while the detail sheet opens.
      const markerCamera =
        openedMarker.place?.id === page.place?.id ? openedMarker.camera : null;
      detailCameraRef.current = {
        ...(markerCamera ?? lastMapCameraRef.current),
      };
    }
    const pageCamera = { ...mapCenter, zoomLevel: mapZoomLevel };
    const cameraBottomInset =
      page.isDetail && detailCameraRef.current
        ? detailCameraRef.current.bottomInset
        : page.isExpanded
        ? 0
        : page.sheetVisibleHeight;
    const isCurrentPage = isActive;
    return (
      <View style={[styles.mapViewport, { bottom: bottomNavigationOffset }]}>
        {mapHeight > 0 ? (
          <KakaoMapNativeComponent
            style={styles.map}
            latitude={pageCamera.latitude}
            longitude={pageCamera.longitude}
            zoomLevel={pageCamera.zoomLevel}
            cameraMoveRequestId={cameraMoveRequestId}
            cameraFitPointsJson={cameraFitPointsJson}
            cameraFitRequestId={cameraFitRequestId}
            cameraBottomInset={cameraBottomInset}
            savedPlacesJson={JSON.stringify(
              (page.clearsSearch ? placesWithCoordinates : markerPlaces).map(
                ({ id, name, latitude, longitude }) => ({
                  id,
                  name,
                  selected: id === page.place?.id,
                  latitude,
                  longitude,
                }),
              ),
            )}
            showsCurrentLocation={locationGranted}
            currentLocationRequestId={currentLocationRequestId}
            onMapReady={event => {
              if (__DEV__) console.log('지도 준비:', event.nativeEvent.ready);
            }}
            onMapError={event => {
              if (!isCurrentPage) return;
              setMapMessage(event.nativeEvent.message);
            }}
            onMarkerPressed={event => {
              const place = markerPlaces.find(
                candidate => candidate.id === event.nativeEvent.id,
              );
              if (!place) return;

              const viewContext = place.savedPlaceId
                ? {
                    placeId: place.id,
                    savedPlaceId: place.savedPlaceId,
                    placeViewId: uuidv4(),
                    source: 'map_marker' as const,
                  }
                : null;
              if (viewContext) {
                captureSavedPlaceSelected(posthog, viewContext);
              }

              const camera: MapCamera = {
                latitude: event.nativeEvent.latitude,
                longitude: event.nativeEvent.longitude,
                zoomLevel: event.nativeEvent.zoomLevel,
                bottomInset: event.nativeEvent.cameraBottomInset,
              };
              setOpenedMarker(current => ({
                place,
                viewContext,
                camera,
                signal: current.signal + 1,
              }));
            }}
            onMapPanStarted={() => {
              if (!isCurrentPage) return;
              setMapPanCollapseSignal(signal => signal + 1);
            }}
            onCameraChanged={event => {
              if (!isCurrentPage) return;
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
              lastMapCameraRef.current = {
                latitude,
                longitude,
                zoomLevel,
                bottomInset: cameraBottomInset,
              };
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
    );
  };

  const renderMapPage = (sheet: React.ReactNode, page: MapSheetPage) => {
    const pageShowsDetailHeader = page.isDetail && page.isExpanded;
    const pageHeaderProgress =
      page.isDetail && !page.isBackPreview
        ? detailHeaderProgress
        : listHeaderProgress;
    const locationButtonOpacity =
      typeof page.translateY === 'number'
        ? Math.min(1, Math.max(0, page.translateY / COLLAPSED_SHEET_HEIGHT))
        : page.translateY.interpolate({
            inputRange: [0, COLLAPSED_SHEET_HEIGHT],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          });
    return (
      <View style={styles.mapStage} pointerEvents="box-none">
        {sheet}
        {mapHeight > 0 ? (
          <Animated.View
            pointerEvents={page.isExpanded ? 'none' : 'auto'}
            style={[
              styles.currentLocationButtonContainer,
              {
                bottom: page.sheetBottomOffset + page.sheetHeight + 16,
                opacity: locationButtonOpacity,
                transform: [{ translateY: page.translateY }],
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="내 위치로 이동"
              hitSlop={8}
              onPress={handleCurrentLocation}
              style={({ pressed }) => [
                styles.currentLocationButton,
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
          </Animated.View>
        ) : null}
        <View pointerEvents="box-none" style={styles.searchOverlay}>
          <Animated.View
            pointerEvents={pageShowsDetailHeader ? 'none' : 'auto'}
            style={{
              opacity: pageHeaderProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
            }}
          >
            <SearchBar
              onPress={isGuest ? onShowGuestLoginPrompt : undefined}
              backButtonPosition={
                (!page.clearsSearch && hasActiveSearch) ||
                (!page.isBackPreview && isSearchFocused) ||
                page.isExpanded ||
                page.isDetail
                  ? 'leading'
                  : 'inside'
              }
              value={page.clearsSearch ? '' : searchKeyword}
              onChangeText={handleSearchKeywordChange}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              onSubmitEditing={handleSearch}
              onPressSearchAction={handleSearch}
              topInset={topInset}
              onPressBack={
                (!page.clearsSearch && hasActiveSearch) ||
                (!page.isBackPreview && isSearchFocused) ||
                page.isExpanded ||
                page.isDetail
                  ? handleSearchBack
                  : undefined
              }
            />
          </Animated.View>
          {page.place ? (
            <Animated.View
              pointerEvents={pageShowsDetailHeader ? 'auto' : 'none'}
              style={[
                styles.expandedDetailHeader,
                {
                  top: topInset + SEARCH_BAR_TOP_GAP,
                  height: SEARCH_BAR_HEIGHT,
                  opacity: pageHeaderProgress,
                },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="뒤로 가기"
                hitSlop={12}
                onPress={handleSearchBack}
                style={styles.expandedDetailBack}
              >
                <Text style={styles.expandedDetailBackText}>‹</Text>
              </Pressable>
              <Text numberOfLines={1} style={styles.expandedDetailTitle}>
                {page.place.name}
              </Text>
              {!isGuest ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="더보기"
                  hitSlop={8}
                  onPress={() => setDetailMoreSignal(signal => signal + 1)}
                  style={styles.expandedDetailMore}
                >
                  <MaterialIcons color="#1a1a2e" name="more-vert" size={24} />
                </Pressable>
              ) : (
                <View style={styles.expandedDetailMore} />
              )}
            </Animated.View>
          ) : null}
        </View>
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
        {bottomNavigationBar}
      </View>
    );
  };

  return (
    <View
      style={styles.container}
      onLayout={event => setMapHeight(event.nativeEvent.layout.height)}
    >
      {mapHeight > 0 ? (
        <PlaceResultSheet
          isActive={isActive}
          onBackGestureRegionChange={onBackGestureRegionChange}
          pageHeight={mapHeight}
          pageBackAvailable={hasActiveSearch || isSearchFocused}
          pageBackStateKey={`${searchKeyword}:${isSearchFocused}`}
          onPageBack={handleSearchBack}
          backPlaces={placesWithCoordinates.filter(
            place =>
              !visibleBounds ||
              (place.latitude! >= visibleBounds.southLatitude &&
                place.latitude! <= visibleBounds.northLatitude &&
                place.longitude! >= visibleBounds.westLongitude &&
                place.longitude! <= visibleBounds.eastLongitude),
          )}
          renderMap={renderMap}
          renderPage={renderMapPage}
          translateY={sheetTranslateY}
          topInset={topInset}
          bottomTabOffset={bottomNavigationOffset}
          places={resultPlaces}
          hasSavedPlaces={savedPlaces.length > 0}
          isSavedPlacesLoading={isSavedPlacesLoading}
          savedPlacesLoadFailed={savedPlacesLoadFailed}
          isSearchActive={hasActiveSearch}
          expandSignal={searchResultSignal}
          openPlace={openedMarker.place}
          openPlaceContext={openedMarker.viewContext}
          openPlaceSignal={openedMarker.signal}
          backToPlaceListSignal={backToPlaceListSignal}
          detailMoreSignal={detailMoreSignal}
          collapseSignal={collapseSignal}
          mapPanCollapseSignal={mapPanCollapseSignal}
          onDetailViewChange={handleDetailViewChange}
          guestReelsByPlace={isGuest ? {} : undefined}
          onAuthenticationRequired={onAuthenticationRequired}
          onGuestExpandInteraction={
            isGuest ? onShowGuestLoginPrompt : undefined
          }
          onSavedPlaceDeleted={savedPlaceId => {
            setSavedPlaces(current =>
              current.filter(place => place.savedPlaceId !== savedPlaceId),
            );
          }}
          onDeleteGuestPlaces={onDeleteGuestPlaces}
          onExpandedChange={expanded => {
            setIsSheetExpanded(expanded);
            if (isGuest && expanded) {
              onShowGuestLoginPrompt?.();
            }
          }}
          isVisibleAreaUpdating={!hasActiveSearch && visibleBounds === null}
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
  mapStage: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  searchOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    elevation: 20,
  },
  expandedDetailHeader: {
    position: 'absolute',
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 11,
  },
  expandedDetailBack: {
    width: SEARCH_BAR_HEIGHT,
    height: SEARCH_BAR_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expandedDetailBackText: {
    marginTop: -4,
    fontSize: 31,
    lineHeight: 35,
    color: '#202124',
  },
  expandedDetailTitle: {
    flex: 1,
    flexShrink: 1,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  expandedDetailMore: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapViewport: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  currentLocationButtonContainer: {
    position: 'absolute',
    right: 18,
    width: 44,
    height: 44,
    zIndex: 10,
    elevation: 10,
  },
  currentLocationButton: {
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
    elevation: 10,
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
