import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import {usePostHog} from 'posthog-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {v4 as uuidv4} from 'uuid';

import {
  captureSavedPlaceSelected,
  captureSavedPlacesViewed,
  type SavedPlaceViewContext,
} from '../../analytics/savedPlaceEvents';
import {
  BOTTOM_NAVIGATION_BAR_HEIGHT,
  bottomNavigationBarContainerStyle,
  getBottomNavigationBarOffset,
} from '../../components/BottomNavigationBar';
import { toSavedPlaceDisplayPlace } from '../../entities/place/api';
import type { Place } from '../../entities/place/types';
import { deleteSavedPlaces, getSavedPlaces } from '../../entities/info/api';
import type { SavedPlacesApiError } from '../../entities/info/types';
import { SavedPlacesErrorState } from './components/SavedPlacesErrorState';
import { SavedPlacesEmptyState } from './components/SavedPlacesEmptyState';
import { SavedPlaceGrid } from './components/SavedPlaceGrid';
import { SavedPlacesHeader } from './components/SavedPlacesHeader';
import { SavedPlacesLinkDialog } from './components/SavedPlacesLinkDialog';
import { SavedPlacesSearchPanel } from './components/SavedPlacesSearchPanel';
import { SavedPlacesSkeleton } from './components/SavedPlacesSkeleton';
import {
  createShare,
  normalizeInstagramContentUrl,
} from '../../entities/content/api';
import type { ApiError } from '../../lib/api/errors';
import {
  registerExtraction,
  subscribeExtractionPoller,
} from '../../lib/extraction-poller';
import {
  getRecentSearches,
  setRecentSearches as persistRecentSearches,
} from '../../lib/searchHistoryStorage';

const MAX_RECENT_SEARCHES = 10;

// 상세페이지로 이동하면 이 화면이 언마운트되므로, 복귀 시 최신 요청을
// 기다리는 동안 기존 목록을 바로 보여주기 위한 메모리 캐시입니다.
let cachedSavedPlaces: Place[] | null = null;

type SavedPlacesScreenProps = {
  onOpenDetail: (place: Place, context?: SavedPlaceViewContext) => void;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  onAuthenticationRequired?: () => void;
  onEditModeChange?: (isEditing: boolean) => void;
  /** Allows previews/tests to provide a fixed list instead of calling the API. */
  onRequireLogin?: () => void;
  places?: Place[];
};

function SavedPlacesEditAction({
  isEditing,
  onPress,
}: {
  isEditing: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.editActionRow}>
      <Pressable
        accessibilityLabel={isEditing ? '보관함 편집 취소' : '보관함 편집'}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPress}
        style={({pressed}) => [
          styles.editButton,
          pressed && styles.editButtonPressed,
        ]}>
        <Text style={styles.editButtonText}>{isEditing ? '취소' : '편집'}</Text>
      </Pressable>
    </View>
  );
}

export function SavedPlacesScreen({
  onOpenDetail,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  onAuthenticationRequired,
  onEditModeChange,
  onRequireLogin,
  places: providedPlaces,
}: SavedPlacesScreenProps) {
  const posthog = usePostHog();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isRecentSearchesHydrated, setIsRecentSearchesHydrated] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [places, setPlaces] = useState<Place[]>(
    providedPlaces ?? cachedSavedPlaces ?? [],
  );
  const [error, setError] = useState<SavedPlacesApiError | null>(null);
  const [isLoading, setIsLoading] = useState(
    providedPlaces === undefined && cachedSavedPlaces === null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<SavedPlacesApiError | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasCapturedViewRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const hasSavedPlaces = places.length > 0;
  const bottomActionOffset = getBottomNavigationBarOffset(bottomInset);

  useEffect(() => {
    if (isLoading || error || hasCapturedViewRef.current) {
      return;
    }

    hasCapturedViewRef.current = true;
    captureSavedPlacesViewed(posthog, {
      placeCount: places.length,
      entryType: 'direct',
    });
  }, [error, isLoading, places.length, posthog]);

  useEffect(() => {
    if (isLoading || !hasSavedPlaces || initialScrollOffset <= 0) {
      return;
    }

    const restoreScrollPosition = requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        y: initialScrollOffset,
        animated: false,
      });
    });

    return () => cancelAnimationFrame(restoreScrollPosition);
  }, [hasSavedPlaces, initialScrollOffset, isLoading]);

  useEffect(() => {
    return () => onEditModeChange?.(false);
  }, [onEditModeChange]);

  const loadSavedPlaces = useCallback(async () => {
    if (providedPlaces !== undefined) {
      setPlaces(providedPlaces);
      return providedPlaces;
    }

    setIsLoading(true);
    setError(null);
    try {
      const savedPlaces = await getSavedPlaces();
      const nextPlaces = savedPlaces.map(toSavedPlaceDisplayPlace);
      cachedSavedPlaces = nextPlaces;
      setPlaces(nextPlaces);
      return nextPlaces;
    } catch (nextError) {
      const apiError = nextError as SavedPlacesApiError;
      setError(apiError);
      if (apiError.errorCode === 'AUTH401_001') {
        onAuthenticationRequired?.();
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [onAuthenticationRequired, providedPlaces]);

  const refreshSavedPlaces = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);

    try {
      await loadSavedPlaces();
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [loadSavedPlaces]);

  useEffect(() => {
    loadSavedPlaces();
  }, [loadSavedPlaces]);

  useEffect(() => {
    let isMounted = true;

    getRecentSearches()
      .then(savedSearches => {
        if (!isMounted) {
          return;
        }

        setRecentSearches(savedSearches.slice(0, MAX_RECENT_SEARCHES));
        setIsRecentSearchesHydrated(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setIsRecentSearchesHydrated(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isRecentSearchesHydrated) {
      return;
    }

    persistRecentSearches(recentSearches).catch(() => undefined);
  }, [isRecentSearchesHydrated, recentSearches]);

  useEffect(
    () =>
      subscribeExtractionPoller(event => {
        // 분석에 성공한 항목의 장소는 서버가 이미 보관함에 저장했으므로 목록만 다시 읽습니다.
        if (
          event.finished.some(item => item.extractionStatus === 'SUCCEEDED')
        ) {
          loadSavedPlaces().catch(() => undefined);
        }
      }),
    [loadSavedPlaces],
  );

  const openDialog = () => {
    setLinkError(null);
    setIsDialogVisible(true);
  };

  const closeDialog = () => {
    if (isSubmitting) {
      return;
    }
    setIsDialogVisible(false);
    setLinkValue('');
    setLinkError(null);
  };

  const handleSaveLink = async () => {
    if (isSubmitting) {
      return;
    }

    const instagramUrl = normalizeInstagramContentUrl(linkValue);
    if (!instagramUrl) {
      setLinkError(
        '지원하지 않는 링크입니다. Instagram 릴스 링크를 입력해주세요.',
      );
      return;
    }

    setIsSubmitting(true);
    setLinkError(null);
    try {
      const share = await createShare(instagramUrl);
      setIsDialogVisible(false);
      setLinkValue('');
      if (share.extractionStatus === 'EXTRACTING') {
        // 분석이 끝나면 폴러가 알려 주고, 위의 구독이 보관함을 다시 읽습니다.
        registerExtraction(share.sharedMediaId);
      } else if (share.extractionStatus === 'SUCCEEDED') {
        // 이미 분석에 성공한 게시물이라 장소가 응답 시점에 보관함에 들어 있습니다.
        loadSavedPlaces().catch(() => undefined);
      } else {
        Alert.alert(
          '장소 분석에 실패했어요',
          '히스토리에서 자세한 내용을 확인할 수 있어요.',
        );
      }
    } catch (submitError) {
      const apiError = submitError as ApiError;
      // 토큰이 없거나(AUTH401_004) 갱신한 토큰마저 거절되면(AUTH401_001) 다시 로그인해야 합니다.
      if (
        apiError.errorCode === 'AUTH401_001' ||
        apiError.errorCode === 'AUTH401_004'
      ) {
        setIsDialogVisible(false);
        onRequireLogin?.();
        return;
      }

      setLinkError(apiError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handlePressEdit = useCallback(() => {
    const next = !isEditing;
    setIsEditing(next);
    setSelectedPlaceIds(new Set());
    onEditModeChange?.(next);
  }, [isEditing, onEditModeChange]);

  const enterEditMode = useCallback(() => {
    setIsEditing(true);
    setSelectedPlaceIds(new Set());
    onEditModeChange?.(true);
  }, [onEditModeChange]);

  const togglePlaceSelection = useCallback((placeId: string) => {
    setSelectedPlaceIds(current => {
      const next = new Set(current);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });
  }, []);

  const handleDeleteSelectedPlaces = useCallback(async () => {
    if (isDeleting || selectedPlaceIds.size === 0) {
      return;
    }

    const savedPlaceIds = places.flatMap(place =>
      selectedPlaceIds.has(place.id) && place.savedPlaceId
        ? [place.savedPlaceId]
        : [],
    );
    if (savedPlaceIds.length !== selectedPlaceIds.size) {
      setDeleteError({
        status: 400,
        errorCode: 'COMMON400_001',
        message: '요청 내용을 확인해주세요.',
        retryable: false,
      });
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSavedPlaces(savedPlaceIds);
      const deletedIds = new Set(savedPlaceIds);
      setPlaces(current =>
        current.filter(place => !deletedIds.has(place.savedPlaceId ?? '')),
      );
      setSelectedPlaceIds(new Set());
      setIsEditing(false);
      onEditModeChange?.(false);
    } catch (nextError) {
      const apiError = nextError as SavedPlacesApiError;
      if (apiError.errorCode === 'CLIENT000_002') {
        const refreshedPlaces = await loadSavedPlaces();
        const deletedIds = new Set(savedPlaceIds);
        const isDeletionConfirmed =
          refreshedPlaces !== null &&
          refreshedPlaces.every(place => !deletedIds.has(place.savedPlaceId ?? ''));

        if (isDeletionConfirmed) {
          setSelectedPlaceIds(new Set());
          setIsEditing(false);
          onEditModeChange?.(false);
          return;
        }
      }

      setDeleteError(apiError);
      if (apiError.errorCode === 'AUTH401_001' || apiError.errorCode === 'AUTH401_002') {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsDeleting(false);
    }
  }, [
    isDeleting,
    loadSavedPlaces,
    onAuthenticationRequired,
    onEditModeChange,
    places,
    selectedPlaceIds,
  ]);

  const confirmDeleteSelectedPlaces = useCallback(() => {
    if (isDeleting || selectedPlaceIds.size === 0) {
      return;
    }

    const count = selectedPlaceIds.size;
    Alert.alert(
      '선택한 장소를 삭제할까요?',
      `선택한 ${count}곳의 장소가 보관함에서 삭제됩니다.`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            handleDeleteSelectedPlaces().catch(() => undefined);
          },
        },
      ],
    );
  }, [handleDeleteSelectedPlaces, isDeleting, selectedPlaceIds.size]);

  const saveRecentSearch = useCallback((value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) {
      return;
    }

    setRecentSearches(current => {
      const nextSearches = current.filter(item => item !== normalizedValue);
      return [normalizedValue, ...nextSearches].slice(0, MAX_RECENT_SEARCHES);
    });
  }, []);

  const openPlaceDetail = useCallback(
    (
      place: Place,
      source: SavedPlaceViewContext['source'],
      position: number,
      searchId?: string,
    ) => {
      if (!place.savedPlaceId) {
        onOpenDetail(place);
        return;
      }

      const context: SavedPlaceViewContext = {
        placeId: place.id,
        savedPlaceId: place.savedPlaceId,
        placeViewId: uuidv4(),
        source,
      };
      captureSavedPlaceSelected(posthog, {
        ...context,
        searchId,
        position,
      });
      onOpenDetail(place, context);
    },
    [onOpenDetail, posthog],
  );

  return (
    <View style={styles.container}>
      {isSearchOpen ? (
        <>
          <SavedPlacesSearchPanel
            places={places}
            recentSearches={recentSearches}
            onCloseSearch={() => setIsSearchOpen(false)}
            onPressPlace={(place, selection) =>
              openPlaceDetail(
                place,
                'saved_places_search',
                selection.position,
                selection.searchId,
              )
            }
            onSaveSearchTerm={saveRecentSearch}
          />
        </>
      ) : (
        <>
          <SavedPlacesHeader onPressSearch={() => setIsSearchOpen(true)} />
          {error && hasSavedPlaces ? (
            <View style={styles.errorBanner}>
              <Text numberOfLines={1} style={styles.errorText}>
                {error.message}
              </Text>
              {error.retryable ? (
                <Pressable onPress={loadSavedPlaces}>
                  <Text style={styles.errorRetryText}>재시도</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {deleteError ? (
            <View style={styles.deleteErrorBanner}>
              <Text numberOfLines={2} style={styles.deleteErrorText}>
                {deleteError.message}
              </Text>
              {deleteError.retryable ? (
                <Pressable onPress={handleDeleteSelectedPlaces}>
                  <Text style={styles.deleteErrorRetryText}>재시도</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {isLoading && !hasSavedPlaces ? (
            <SavedPlacesSkeleton />
          ) : hasSavedPlaces ? (
            <>
              <ScrollView
                ref={scrollViewRef}
                alwaysBounceVertical
                onScroll={event =>
                  onScrollOffsetChange?.(event.nativeEvent.contentOffset.y)
                }
                refreshControl={
                  <RefreshControl
                    colors={['#8FA2FF']}
                    onRefresh={refreshSavedPlaces}
                    progressBackgroundColor="#ffffff"
                    refreshing={isRefreshing}
                    tintColor="#8FA2FF"
                  />
                }
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={false}
              >
                <SavedPlacesEditAction
                  isEditing={isEditing}
                  onPress={handlePressEdit}
                />
                <SavedPlaceGrid
                  isEditing={isEditing}
                  places={places}
                  onLongPressPlace={enterEditMode}
                  onPressPlace={(place, position) =>
                    openPlaceDetail(place, 'saved_places_grid', position)
                  }
                  onTogglePlaceSelection={togglePlaceSelection}
                  selectedPlaceIds={selectedPlaceIds}
                />
                <View style={styles.scrollFooter}>
                  <Pressable
                    onPress={scrollToTop}
                    style={styles.scrollTopButton}
                  >
                    <MaterialIcons color="#8FA2FF" name="upload" size={24} />
                  </Pressable>
                </View>
              </ScrollView>
            </>
          ) : error ? (
            <SavedPlacesErrorState error={error} onRetry={loadSavedPlaces} />
          ) : (
            <SavedPlacesEmptyState />
          )}
        </>
      )}
      {isEditing ? (
        <Pressable
          accessibilityLabel={
            selectedPlaceIds.size > 0 ? '선택한 장소 삭제하기' : '보관함 편집 취소'
          }
          accessibilityRole="button"
          disabled={isDeleting}
          onPress={
            selectedPlaceIds.size === 0
              ? handlePressEdit
              : confirmDeleteSelectedPlaces
          }
          style={({pressed}) => [
            bottomNavigationBarContainerStyle,
            styles.deleteAction,
            {bottom: bottomActionOffset},
            isDeleting && styles.deleteActionDisabled,
            pressed && styles.deleteActionPressed,
          ]}>
          <View key="saved-places-delete-action-content" style={styles.deleteActionContent}>
            <Text style={styles.deleteActionText}>
              {selectedPlaceIds.size > 0
                ? isDeleting
                  ? '삭제 중...'
                  : '삭제하기'
                : '취소'}
            </Text>
            {selectedPlaceIds.size > 0 ? (
              <View style={styles.deleteCountBadge}>
                <Text style={styles.deleteCountText}>{selectedPlaceIds.size}</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="장소 링크 추가"
          accessibilityRole="button"
          onPress={openDialog}
          style={[
            styles.fabShadow,
            {
              bottom:
                BOTTOM_NAVIGATION_BAR_HEIGHT +
                getBottomNavigationBarOffset(bottomInset) +
                12,
            },
          ]}
        >
          <View
            key="saved-places-fab"
            style={styles.fab}
          >
            <Text style={styles.fabText}>＋</Text>
          </View>
        </Pressable>
      )}
      <SavedPlacesLinkDialog
        visible={isDialogVisible}
        value={linkValue}
        onChangeValue={value => {
          setLinkValue(value);
          setLinkError(null);
        }}
        errorMessage={linkError}
        onClose={closeDialog}
        isSubmitting={isSubmitting}
        onSubmit={handleSaveLink}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  deleteAction: {
    backgroundColor: '#000000',
    justifyContent: 'center',
  },
  deleteActionPressed: {
    opacity: 0.82,
  },
  deleteActionDisabled: {
    opacity: 0.5,
  },
  deleteActionText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  deleteActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteCountBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  deleteCountText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  deleteErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#fff5f5',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  deleteErrorText: {
    flex: 1,
    color: '#7c2d2d',
    fontSize: 13,
  },
  deleteErrorRetryText: {
    color: '#5c6fc8',
    fontSize: 13,
    fontWeight: '700',
  },
  editActionRow: {
    alignItems: 'flex-end',
    marginHorizontal: 24,
    marginBottom: 2,
  },
  editButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  editButtonPressed: {
    opacity: 0.6,
  },
  editButtonText: {
    color: '#7b7d8b',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#fff5f5',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  errorText: { flex: 1, color: '#7c2d2d', fontSize: 13 },
  errorRetryText: { color: '#5c6fc8', fontSize: 13, fontWeight: '700' },
  fabShadow: {
    position: 'absolute',
    right: 18,
    // The screen is rendered underneath the absolute bottom tab bar.
    // Keep the FAB above it, including the device's bottom safe-area inset.
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
