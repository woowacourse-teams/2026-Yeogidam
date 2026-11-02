import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ALL_CATEGORY,
  CATEGORY_CHIPS_HEIGHT,
  CATEGORY_CHIPS_TOP_GAP,
  CategoryFilterChips,
  filterPlacesByCategory,
  PLACE_CATEGORIES,
} from '../../components/CategoryFilterChips';
import {
  FolderDetailHeader,
  FolderActionSheet,
  FolderList,
  FolderNameDialog,
  FolderSegmentHeader,
  PlaceFolderAssignPicker,
  type SheetMode,
} from './components/PlaceFolderPanel';
import {
  MAX_FOLDER_COUNT,
  syncSavedPlaceFolderIds,
  usePlaceFolders,
} from '../../lib/usePlaceFolders';
import { getNextFolderColor } from '../../entities/folder/color';
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
import { resolvePlaceCategoryCode } from '../../entities/place/category';
import type { Place } from '../../entities/place/types';
import { ONBOARDING_MAP_CENTER } from '../../entities/onboarding/data';
import { getSavedPlaces } from '../../entities/info/api';
import { subscribeRecentShares } from '../../entities/content/recent-shares-poller';
import {
  SEARCH_BAR_HEIGHT,
  SEARCH_BAR_TOP_GAP,
  SearchBar,
} from '../../components/SearchBar';
import {
  COLLAPSED_SHEET_HEIGHT,
  LIST_TOP_GAP,
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

const FOLDER_LIST_BOTTOM_PADDING = 320;
const SAVED_PLACES_COMPLETION_POLL_INTERVAL_MS = 5000;

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
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [sheetMode, setSheetMode] = useState<SheetMode>('places');
  const [openedFolderId, setOpenedFolderId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<
    { kind: 'create' } | { kind: 'rename'; folderId: string } | null
  >(null);
  const [folderActionId, setFolderActionId] = useState<string | null>(null);
  const isSubmittingFolderRef = useRef(false);
  const [folderAssignPlace, setFolderAssignPlace] = useState<Place | null>(
    null,
  );
  const {
    folders,
    getPlaceFolderIds,
    createFolder,
    updateFolder,
    deleteFolder,
    setPlaceFolderIds,
  } = usePlaceFolders(!isGuest);
  const [searchResultSignal, setSearchResultSignal] = useState(0);
  const [backToPlaceListSignal, setBackToPlaceListSignal] = useState(0);
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
  const [savedPlacesRefreshSignal, setSavedPlacesRefreshSignal] = useState(0);
  const completedReelIdsRef = useRef<Set<string> | null>(null);

  // 지도가 보이는 중에 릴스 저장이 끝나면 새 장소를 읽는다. 첫 결과는 기준값으로만 쓴다.
  useEffect(() => {
    if (isGuest) {
      completedReelIdsRef.current = null;
      return;
    }
    const subscription = subscribeRecentShares({
      intervalMs: SAVED_PLACES_COMPLETION_POLL_INTERVAL_MS,
      onResult: ({ reels }) => {
        const completedIds = new Set(
          reels
            .filter(reel => reel.processing_status === 'COMPLETED')
            .map(reel => String(reel.id)),
        );
        const previousIds = completedReelIdsRef.current;
        completedReelIdsRef.current = completedIds;
        if (!previousIds) return;
        for (const id of completedIds) {
          if (!previousIds.has(id)) {
            setSavedPlacesRefreshSignal(signal => signal + 1);
            return;
          }
        }
      },
    });
    return () => {
      subscription.unsubscribe();
      completedReelIdsRef.current = null;
    };
  }, [isGuest]);
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
    // 탭이 숨겨진 채 마운트돼 있으므로, 다시 보일 때마다 목록을 새로 읽는다.
    if (!isActive) return;
    let isMounted = true;

    getSavedPlaces()
      .then(savedPlaceItems => {
        if (!isMounted) return;

        syncSavedPlaceFolderIds(savedPlaceItems);
        setSavedPlacesLoadFailed(false);
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
  }, [isGuest, isActive, savedPlacesRefreshSignal]);
  // 폴더에 담거나 폴더를 지운 결과가 목록을 다시 읽기 전에도 보이도록 훅의 소속을 씁니다.
  const allPlacesWithCoordinates = useMemo(
    () =>
      savedPlaces
        .filter(
          place =>
            place.latitude !== undefined && place.longitude !== undefined,
        )
        .map(place => ({
          ...place,
          folderIds: getPlaceFolderIds(place),
        })),
    [getPlaceFolderIds, savedPlaces],
  );
  const openedFolder = useMemo(
    () => folders.find(folder => folder.id === openedFolderId) ?? null,
    [folders, openedFolderId],
  );
  const isFolderListVisible =
    !isGuest && sheetMode === 'folders' && !openedFolder;
  const folderScopedPlaces = useMemo(() => {
    if (openedFolder) {
      return allPlacesWithCoordinates.filter(place =>
        place.folderIds.includes(openedFolder.id),
      );
    }
    // 폴더 목록에서는 어느 폴더에든 담긴 장소만 지도에 보여줍니다.
    if (isFolderListVisible) {
      return allPlacesWithCoordinates.filter(
        place => place.folderIds.length > 0,
      );
    }
    return allPlacesWithCoordinates;
  }, [allPlacesWithCoordinates, isFolderListVisible, openedFolder]);
  const folderListItems = useMemo(
    () =>
      folders.map(folder => {
        const folderPlaces = allPlacesWithCoordinates.filter(place =>
          place.folderIds.includes(folder.id),
        );
        return {
          id: folder.id,
          name: folder.name,
          color: folder.color,
          count: folderPlaces.length,
        };
      }),
    [allPlacesWithCoordinates, folders],
  );
  // 장소 탭에서는 모든 핀이 기본 색입니다. 폴더 목록에서는 장소를 가장 최근에 담은
  // 폴더(folderIds의 마지막)의 색, 폴더를 열어 둔 동안에는 그 폴더의 색으로 핀을 그립니다.
  const pinColorByPlaceId = useMemo(() => {
    const colors = new Map<string, string>();
    if (!openedFolder && !isFolderListVisible) return colors;

    const folderColorById = new Map(
      folders.map(folder => [folder.id, folder.color]),
    );
    for (const place of allPlacesWithCoordinates) {
      const folderId = openedFolder
        ? place.folderIds.includes(openedFolder.id)
          ? openedFolder.id
          : undefined
        : place.folderIds[place.folderIds.length - 1];
      const color = folderId && folderColorById.get(folderId);
      if (color) colors.set(place.id, color);
    }
    return colors;
  }, [allPlacesWithCoordinates, folders, isFolderListVisible, openedFolder]);
  const activeCategory = selectedCategory;
  const placesWithCoordinates = useMemo(
    () => filterPlacesByCategory(folderScopedPlaces, activeCategory),
    [folderScopedPlaces, activeCategory],
  );
  const hasActiveSearch = searchKeyword.trim().length > 0;
  const resultPlaces = useMemo(() => {
    const candidatePlaces = searchedPlaces ?? placesWithCoordinates;
    // 폴더 안에서는 지도 범위와 상관없이 폴더의 모든 장소를 보여줍니다.
    if (openedFolder) return candidatePlaces;
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
  }, [openedFolder, placesWithCoordinates, searchedPlaces, visibleBounds]);
  const markerPlaces = searchedPlaces ?? placesWithCoordinates;
  const cameraFitPointsJson = useMemo(
    () =>
      JSON.stringify(
        (searchedPlaces ?? (openedFolder ? placesWithCoordinates : [])).map(
          ({ latitude, longitude }) => ({
            latitude,
            longitude,
          }),
        ),
      ),
    [openedFolder, placesWithCoordinates, searchedPlaces],
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
    }
  };

  const focusMapOnPlaces = (places: Place[]) => {
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
    }
  };

  const handleChangeSheetMode = (mode: SheetMode) => {
    setSheetMode(mode);
    setOpenedFolderId(null);
    setSelectedCategory(ALL_CATEGORY);
    setSearchedPlaces(null);
    setSearchKeyword('');
  };

  const handleOpenFolder = (folderId: string) => {
    const folder = folders.find(candidate => candidate.id === folderId);
    if (!folder) return;

    setOpenedFolderId(folderId);
    setSelectedCategory(ALL_CATEGORY);
    setSearchedPlaces(null);
    setSearchKeyword('');
    focusMapOnPlaces(
      allPlacesWithCoordinates.filter(place =>
        place.folderIds.includes(folderId),
      ),
    );
  };

  const handleCloseFolder = () => {
    setOpenedFolderId(null);
    setSelectedCategory(ALL_CATEGORY);
  };

  const handleCreateFolder = () => {
    if (folders.length >= MAX_FOLDER_COUNT) {
      Alert.alert(`폴더는 최대 ${MAX_FOLDER_COUNT}개까지 만들 수 있어요.`);
      return;
    }
    setFolderDialog({ kind: 'create' });
  };

  const handleSubmitFolderName = async (name: string, color: string) => {
    // 만들기를 연달아 누르면 두 번째 요청이 이름 중복(409)이 되므로 응답 전에는 막습니다.
    if (isSubmittingFolderRef.current) return;
    isSubmittingFolderRef.current = true;
    try {
      const succeeded =
        folderDialog?.kind === 'rename'
          ? await updateFolder(folderDialog.folderId, name, color)
          : (await createFolder(name, color)) !== null;
      // 실패하면 안내를 띄우고 입력 창을 열어 둬 이름을 고쳐 다시 시도할 수 있게 합니다.
      if (succeeded) setFolderDialog(null);
    } finally {
      isSubmittingFolderRef.current = false;
    }
  };

  const confirmDeleteFolder = (folderId: string) => {
    const folder = folders.find(candidate => candidate.id === folderId);
    if (!folder) return;

    Alert.alert(
      `'${folder.name}' 폴더를 삭제할까요?`,
      '폴더만 삭제되고 저장한 장소는 그대로 남아요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            deleteFolder(folderId).then(deleted => {
              if (deleted && openedFolderId === folderId) handleCloseFolder();
            });
          },
        },
      ],
    );
  };

  const showFolderActions = (folderId: string) => {
    if (folders.some(candidate => candidate.id === folderId)) {
      setFolderActionId(folderId);
    }
  };

  const handleSelectCategory = (category: string) => {
    // 폴더 목록에서는 시트를 그대로 두고 지도 핀만 거릅니다.
    if (isPlaceDetailVisible) {
      setBackToPlaceListSignal(signal => signal + 1);
    }
    setSelectedCategory(category);
    setSearchedPlaces(null);
    setSearchKeyword('');
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

    if (openedFolderId !== null) {
      handleCloseFolder();
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
  }, [
    hasActiveSearch,
    isPlaceDetailVisible,
    isSearchFocused,
    isSheetExpanded,
    openedFolderId,
  ]);

  useEffect(() => {
    const hasSearchBackState =
      isActive &&
      (isPlaceDetailVisible ||
        isSheetExpanded ||
        hasActiveSearch ||
        isSearchFocused ||
        openedFolderId !== null);
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
    openedFolderId,
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
            cameraFitPointsJson={cameraFitPointsJson}
            cameraFitRequestId={cameraFitRequestId}
            cameraBottomInset={cameraBottomInset}
            savedPlacesJson={JSON.stringify(
              (page.clearsSearch ? placesWithCoordinates : markerPlaces).map(
                ({
                  id,
                  name,
                  latitude,
                  longitude,
                  category,
                  categoryCode,
                }) => ({
                  id,
                  name,
                  selected: id === page.place?.id,
                  latitude,
                  longitude,
                  color: pinColorByPlaceId.get(id),
                  // 핀 안에 넣을 카테고리 아이콘을 네이티브가 범주 코드로 고릅니다.
                  category: resolvePlaceCategoryCode({ category, categoryCode }),
                }),
              ),
            )}
            showsCurrentLocation={locationGranted}
            currentLocationRequestId={currentLocationRequestId}
            onMapReady={event => {
              console.log('지도 준비:', event.nativeEvent.ready);
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
    // 목록·상세 시트는 카테고리 칩 아래에서 멈추므로, 현재 위치 버튼도 그 위치에서
    // 사라지도록 페이드 시작점을 맞춥니다.
    const locationFadeStart =
      topInset +
      SEARCH_BAR_TOP_GAP +
      SEARCH_BAR_HEIGHT +
      CATEGORY_CHIPS_TOP_GAP +
      CATEGORY_CHIPS_HEIGHT +
      LIST_TOP_GAP;
    const locationButtonOpacity =
      typeof page.translateY === 'number'
        ? Math.min(
            1,
            Math.max(
              0,
              (page.translateY - locationFadeStart) / COLLAPSED_SHEET_HEIGHT,
            ),
          )
        : page.translateY.interpolate({
            inputRange: [
              locationFadeStart,
              locationFadeStart + COLLAPSED_SHEET_HEIGHT,
            ],
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
          <View>
            <SearchBar
              onPress={isGuest ? onShowGuestLoginPrompt : undefined}
              backButtonPosition={
                (!page.clearsSearch && hasActiveSearch) ||
                (!page.isBackPreview && isSearchFocused) ||
                page.isExpanded ||
                page.isDetail ||
                openedFolderId !== null
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
                page.isDetail ||
                openedFolderId !== null
                  ? handleSearchBack
                  : undefined
              }
            />
            <CategoryFilterChips
              categories={PLACE_CATEGORIES}
              selectedCategory={activeCategory}
              onSelectCategory={handleSelectCategory}
              style={{
                marginTop:
                  topInset +
                  SEARCH_BAR_TOP_GAP +
                  SEARCH_BAR_HEIGHT +
                  CATEGORY_CHIPS_TOP_GAP,
              }}
            />
          </View>
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
          pageBackAvailable={
            hasActiveSearch || isSearchFocused || openedFolderId !== null
          }
          pageBackStateKey={`${searchKeyword}:${isSearchFocused}:${openedFolderId}`}
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
          folderHeader={
            isGuest ? undefined : openedFolder ? (
              <FolderDetailHeader
                name={openedFolder.name}
                color={openedFolder.color}
                count={folderScopedPlaces.length}
                onMore={() => showFolderActions(openedFolder.id)}
              />
            ) : (
              <FolderSegmentHeader
                mode={sheetMode}
                onChangeMode={handleChangeSheetMode}
              />
            )
          }
          folderContent={
            isFolderListVisible ? (
              <FolderList
                folders={folderListItems}
                bottomPadding={FOLDER_LIST_BOTTOM_PADDING}
                onOpenFolder={handleOpenFolder}
                onLongPressFolder={showFolderActions}
                onCreateFolder={handleCreateFolder}
              />
            ) : activeCategory !== ALL_CATEGORY &&
              placesWithCoordinates.length === 0 ? (
              <View style={styles.folderEmpty}>
                <Text style={styles.folderEmptyTitle}>
                  {activeCategory} 카테고리에 저장한 장소가 없어요
                </Text>
              </View>
            ) : undefined
          }
          emptyContent={
            openedFolder && folderScopedPlaces.length === 0 ? (
              <View style={[styles.folderEmpty, styles.folderEmptyInList]}>
                <Text style={styles.folderEmptyTitle}>폴더가 비어 있어요</Text>
                <Text style={styles.folderEmptyHint}>
                  장소 상세의 더보기에서 이 폴더에 담을 수 있어요.
                </Text>
              </View>
            ) : undefined
          }
          isSavedPlacesLoading={isSavedPlacesLoading}
          savedPlacesLoadFailed={savedPlacesLoadFailed}
          isSearchActive={hasActiveSearch}
          expandSignal={searchResultSignal}
          openPlace={openedMarker.place}
          openPlaceContext={openedMarker.viewContext}
          openPlaceSignal={openedMarker.signal}
          backToPlaceListSignal={backToPlaceListSignal}
          collapseSignal={collapseSignal}
          mapPanCollapseSignal={mapPanCollapseSignal}
          onDetailViewChange={handleDetailViewChange}
          guestReelsByPlace={isGuest ? {} : undefined}
          onAuthenticationRequired={onAuthenticationRequired}
          onGuestExpandInteraction={
            isGuest ? onShowGuestLoginPrompt : undefined
          }
          onEditPlaceFolders={isGuest ? undefined : setFolderAssignPlace}
          getPlaceFoldersLabel={place =>
            getPlaceFolderIds(place).length > 0
              ? '폴더 수정'
              : '폴더에 담기'
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
      {!isGuest ? (
        <>
          <FolderNameDialog
            visible={folderDialog !== null}
            title={
              folderDialog?.kind === 'rename' ? '폴더 수정' : '새 폴더'
            }
            confirmLabel={folderDialog?.kind === 'rename' ? '변경' : '만들기'}
            initialColor={
              folderDialog?.kind === 'rename'
                ? folders.find(folder => folder.id === folderDialog.folderId)
                    ?.color
                : getNextFolderColor(folders)
            }
            initialName={
              folderDialog?.kind === 'rename'
                ? folders.find(folder => folder.id === folderDialog.folderId)
                    ?.name
                : ''
            }
            existingNames={folders
              .filter(
                folder =>
                  folderDialog?.kind !== 'rename' ||
                  folder.id !== folderDialog.folderId,
              )
              .map(folder => folder.name)}
            onSubmit={handleSubmitFolderName}
            onCancel={() => setFolderDialog(null)}
          />
          <FolderActionSheet
            folder={
              folderListItems.find(folder => folder.id === folderActionId) ??
              null
            }
            onEdit={() => {
              if (folderActionId) {
                setFolderDialog({ kind: 'rename', folderId: folderActionId });
              }
              setFolderActionId(null);
            }}
            onDelete={() => {
              const folderId = folderActionId;
              setFolderActionId(null);
              if (folderId) confirmDeleteFolder(folderId);
            }}
            onClose={() => setFolderActionId(null)}
          />
          <PlaceFolderAssignPicker
            visible={folderAssignPlace !== null}
            placeName={folderAssignPlace?.name ?? ''}
            folders={folderListItems}
            selectedFolderIds={
              folderAssignPlace ? getPlaceFolderIds(folderAssignPlace) : []
            }
            onSave={folderIds => {
              if (folderAssignPlace) {
                setPlaceFolderIds(folderAssignPlace, folderIds);
              }
              setFolderAssignPlace(null);
            }}
            onCancel={() => setFolderAssignPlace(null)}
            onCreateFolder={async (name, color) =>
              (await createFolder(name, color))?.id ?? null
            }
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  folderEmpty: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 34,
  },
  // 장소 목록의 빈 상태 영역이 이미 위 여백을 주므로 겹치지 않게 뺍니다.
  folderEmptyInList: {
    paddingTop: 0,
  },
  folderEmptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  folderEmptyHint: {
    fontSize: 14,
    color: '#8a8fa8',
  },
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  inactiveContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
