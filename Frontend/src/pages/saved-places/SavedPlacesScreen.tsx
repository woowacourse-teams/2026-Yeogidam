import { showAlert } from '../../lib/app-alert';
import {
  ALL_CATEGORY,
  CategoryFilterChips,
  filterPlacesByCategory,
  PLACE_CATEGORIES,
} from '../../components/CategoryFilterChips';
import {
  SEARCH_BAR_HEIGHT,
  SEARCH_BAR_TOP_GAP,
} from '../../components/SearchBar';
import { SwipeBackStack } from '../../components/navigation/SwipeBackStack';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePostHog } from 'posthog-react-native';
import {
  trackActionFinished,
  useScreenAnalytics,
} from '../../analytics/uiEvents';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';

import {
  captureSavedPlaceSelected,
  captureSavedPlacesSearchSubmitted,
  captureSavedPlacesViewed,
  type SavedPlacesSearchMethod,
  type SavedPlaceViewContext,
} from '../../analytics/savedPlaceEvents';
import {
  bottomNavigationBarContainerStyle,
  getBottomNavigationBarOffset,
} from '../../components/BottomNavigationBar';
import { toSavedPlaceDisplayPlace } from '../../entities/place/api';
import { syncSavedPlaceFolderIds } from '../../lib/usePlaceFolders';
import type { Place } from '../../entities/place/types';
import { deleteSavedPlaces, getSavedPlaces } from '../../entities/info/api';
import type { SavedPlacesApiError } from '../../entities/info/types';
import { SavedPlacesErrorState } from './components/SavedPlacesErrorState';
import { SavedPlacesEmptyState } from './components/SavedPlacesEmptyState';
import { SavedPlaceGrid } from './components/SavedPlaceGrid';
import { SavedPlacesHeader } from './components/SavedPlacesHeader';
import { SavedPlacesLinkDialog } from './components/SavedPlacesLinkDialog';
import {
  SavedPlacesEmptyResult,
  type SavedPlacesEmptyResultVariant,
} from './components/SavedPlacesEmptyResult';
import { SavedPlacesSearchPanel } from './components/SavedPlacesSearchPanel';
import { SavedPlacesSkeleton } from './components/SavedPlacesSkeleton';
import { SavedPlacesRecentShares } from './components/SavedPlacesRecentShares';
import {
  type SavedLibraryView,
  SavedPlacesViewToggle,
} from './components/SavedPlacesViewToggle';
import { SavedPostGrid } from './components/SavedPostGrid';
import {
  INITIAL_BAR_REVEAL,
  INITIAL_BAR_SCROLL_STATE,
  reduceBarScroll,
  SavedPlacesStickyBar,
} from './components/SavedPlacesStickyBar';
import { LIBRARY_GUTTER } from './components/libraryTheme';
import { useSavedLibrarySearch } from './useSavedLibrarySearch';
import {
  getReelProcessingStatus,
  normalizeInstagramContentUrl,
  saveContent,
} from '../../entities/content/api';
import {deleteSavedMedia, getSavedMedia} from '../../entities/content/saved-media-api';
import { getRecentSharesSnapshot, subscribeRecentShares } from '../../entities/content/recent-shares-poller';
import type {
  HistoryReel,
  HistoryCursor,
  ReelProcessingStatus,
  SaveSource,
} from '../../entities/content/types';
import {
  normalizeReelError,
  ReelApiError,
} from '../../entities/content/errors';
import {
  getSharedSaveState,
  setSharedSaveState,
  subscribeSharedSaveState,
} from '../../lib/reel-save-state';
import {
  getRecentSearches,
  setRecentSearches as persistRecentSearches,
} from '../../lib/searchHistoryStorage';

const REEL_POLL_INTERVAL_MS = 3000;
const REEL_POLL_TIMEOUT_MS = 90_000;
const REEL_POLL_FAILURE_LIMIT = 3;
const COMPLETED_SAVE_REFRESH_DELAYS_MS = [0, 700, 1500, 3000, 5000];
const MAX_RECENT_SEARCHES = 10;
// 검색 헤더 높이(SearchBar header 레이아웃과 같음). 목록이 있을 때 헤더를 내용 위에 겹쳐 둡니다.
const SAVED_HEADER_HEIGHT = SEARCH_BAR_HEIGHT + SEARCH_BAR_TOP_GAP * 2;
// 공용 폴러는 구독자 중 가장 짧은 주기를 따릅니다. 최근 공유 행은 하단 탭 바(5초)나
// 링크 처리 폴링(3초)이 읽은 결과를 받아 쓰면 되므로, 자체 주기는 길게 잡아 요청을 늘리지 않습니다.
const RECENT_SHARES_INTERVAL_MS = 60_000;

// 상세페이지로 이동하면 이 화면이 언마운트되므로, 복귀 시 최신 요청을
// 기다리는 동안 기존 목록을 바로 보여주기 위한 메모리 캐시입니다.
let cachedSavedPlaces: Place[] | null = null;

type ShareApiDiagnostics = {
  source: SaveSource;
  requestUrl: string;
  saveStatus: ReelProcessingStatus['processing_status'];
  reelId: string;
  reused: boolean | null;
  saveFailureReason: string | null;
  statusQueryCount: number;
  lastQueriedAt: Date | null;
  queriedStatus: ReelProcessingStatus['processing_status'] | null;
  queryFailureReason: string | null;
};

type SavedPlacesScreenProps = {
  isActive?: boolean;
  onNestedBackStateChange?: (canGoBack: boolean) => void;
  onOpenDetail: (place: Place, context?: SavedPlaceViewContext) => void;
  isGuest?: boolean;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  onAuthenticationRequired?: () => void;
  onOpenGuide?: () => void;
  onShowGuestLoginPrompt?: () => void;
  onEditModeChange?: (isEditing: boolean) => void;
  /** 최근 공유 '전체보기'와 게시물 카드에서 히스토리 화면으로 이동합니다. */
  onOpenHistory?: () => void;
  /** 최근 공유의 실패 항목을 눌렀을 때 해당 실패 상세를 엽니다. */
  onOpenFailedReel?: (reel: HistoryReel) => void;
  /** 게시물 카드를 눌렀을 때 해당 게시물의 상세 페이지를 엽니다. */
  onOpenReel?: (reel: HistoryReel) => void;
  /** Allows previews/tests to provide a fixed list instead of calling the API. */
  onRequireLogin?: () => void;
  // onOpenInbox?: () => void;
  places?: Place[];
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
  onSharedResultConsumed?: (requestId?: string) => Promise<void>;
};

export function SavedPlacesScreen({
  isActive: isScreenActive = true,
  onNestedBackStateChange,
  onOpenDetail,
  isGuest = false,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  onAuthenticationRequired,
  onOpenGuide,
  onShowGuestLoginPrompt,
  onEditModeChange,
  onOpenHistory,
  onOpenFailedReel,
  onOpenReel,
  onRequireLogin,
  // onOpenInbox,
  places: providedPlaces,
  onDeleteGuestPlaces,
  onSharedResultConsumed,
}: SavedPlacesScreenProps) {
  const posthog = usePostHog();
  const analytics = useScreenAnalytics('saved');
  const initialScrollOffsetRef = useRef(initialScrollOffset);
  const hasRestoredInitialScrollRef = useRef(false);
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [libraryView, setLibraryView] = useState<SavedLibraryView>('posts');
  // 게시물 삭제와 장소 북마크 해제는 별도의 선택 상태를 사용합니다.
  const [isEditingPosts, setIsEditingPosts] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    () => new Set(),
  );
  // 탭을 다시 눌러 화면이 새로 마운트돼도 최근 공유 줄이 비지 않도록 폴러의 마지막 결과로 시작합니다.
  const [sharedReels, setSharedReels] = useState<HistoryReel[]>(
    () => (isGuest ? [] : getRecentSharesSnapshot()?.reels ?? []),
  );
  const [postReels, setPostReels] = useState<HistoryReel[]>([]);
  const [postCursor, setPostCursor] = useState<HistoryCursor | null>(null);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isRecentSearchesHydrated, setIsRecentSearchesHydrated] =
    useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [places, setPlaces] = useState<Place[]>(
    providedPlaces ?? cachedSavedPlaces ?? [],
  );
  const hasLoadedPlacesRef = useRef(
    providedPlaces !== undefined || cachedSavedPlaces !== null,
  );
  const [error, setError] = useState<SavedPlacesApiError | null>(null);
  const [isLoading, setIsLoading] = useState(
    providedPlaces === undefined && cachedSavedPlaces === null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<SavedPlacesApiError | null>(
    null,
  );
  const [processingReelId, setProcessingReelId] = useState<string | null>(null);
  const [processingReel, setProcessingReel] =
    useState<ReelProcessingStatus | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [completedRefreshIds, setCompletedRefreshIds] = useState<string[]>([]);
  const completedShareIdsRef = useRef<Set<string> | null>(null);
  const queueCompletedRefresh = useCallback((reelId: string) => {
    setCompletedRefreshIds(current =>
      current.includes(reelId) ? current : [...current, reelId],
    );
  }, []);
  const [_statusQueryError, setStatusQueryError] =
    useState<ReelApiError | null>(null);
  const [_isSaveResponseFailure, setIsSaveResponseFailure] = useState(false);
  const [_shareApiDiagnostics, setShareApiDiagnostics] =
    useState<ShareApiDiagnostics | null>(null);
  const [_lastRequestId, setLastRequestId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  // 토글·카테고리 칩 바를 고정하기 위한 스크롤 위치와 바의 원래 y 위치입니다.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [libraryBarLayout, setLibraryBarLayout] = useState<{
    top: number;
    height: number;
  } | null>(null);
  // 바는 아래로 스크롤하면 가려지고, 위로 살짝만 올리면 바로 다시 나타납니다(1=보임, 0=숨김).
  const barReveal = useRef(new Animated.Value(INITIAL_BAR_REVEAL)).current;
  const barScrollStateRef = useRef(INITIAL_BAR_SCROLL_STATE);
  const barRevealTargetRef = useRef(INITIAL_BAR_REVEAL);
  // 화면이 사라진 뒤에 바 숨김/표시 애니메이션이 남아 돌지 않게 멈춥니다.
  useEffect(() => () => barReveal.stopAnimation(), [barReveal]);
  const hasCapturedViewRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const isLoadingMorePostsRef = useRef(false);
  const postRequestIdRef = useRef(0);
  const reelPollStartedAtRef = useRef<number | null>(null);
  const reelPollFailureCountRef = useRef(0);
  const saveRequestIdRef = useRef<string | null>(null);
  const hasSavedPlaces =
    places.length > 0 || postReels.length > 0 || sharedReels.length > 0 || postError !== null;
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const activeCategory = selectedCategory;
  // 검색어가 있으면 보관함 화면은 그대로 두고 그리드 내용만 검색 결과로 바꿉니다.
  const librarySearch = useSavedLibrarySearch({
    places,
    isGuest: Boolean(isGuest),
    onAuthenticationRequired,
  });
  const isSearching = librarySearch.query !== null;
  const activeSearchIdRef = useRef<string | null>(null);
  const filteredPlaces = useMemo(
    () =>
      filterPlacesByCategory(
        isSearching ? librarySearch.places : places,
        activeCategory,
      ),
    [isSearching, librarySearch.places, places, activeCategory],
  );
  const visiblePostReels = isSearching ? librarySearch.reels : postReels;
  // 그리드에 보여 줄 항목이 없으면 빈 그리드 대신 안내를 남은 화면 가운데에 둡니다.
  // 검색 결과가 아예 없으면 검색, 검색 결과가 고른 카테고리에만 없으면 카테고리, 담은 것이 없으면 빈 보관함 안내입니다.
  const emptyResult = ((): {
    variant: SavedPlacesEmptyResultVariant;
    title: string;
    description: string;
  } | null => {
    if (libraryView === 'places') {
      if (isSearching) {
        if (librarySearch.isLoadingPlaces || librarySearch.placeError) return null;
        if (librarySearch.places.length === 0) {
          return {
            variant: 'search',
            title: '검색 결과가 없어요',
            description: '다른 키워드로 다시 검색해보세요.',
          };
        }
      } else if (places.length === 0) {
        return {
          variant: 'empty',
          title: '아직 저장한 장소가 없어요',
          description: '릴스를 공유하고 마음에 드는 장소를 담아보세요.',
        };
      }
      if (filteredPlaces.length > 0) return null;
      return isSearching
        ? {
            variant: 'category',
            title: `${activeCategory} 카테고리에 검색 결과가 없어요`,
            description: '다른 카테고리를 골라보세요.',
          }
        : {
            variant: 'empty',
            title: `${activeCategory} 카테고리에 저장한 장소가 없어요`,
            description: '다른 카테고리를 골라보세요.',
          };
    }
    if (isSearching) {
      return librarySearch.isLoadingReels ||
        librarySearch.reelError ||
        librarySearch.reels.length > 0
        ? null
        : {
            variant: 'search',
            title: '검색 결과가 없어요',
            description: '다른 키워드로 다시 검색해보세요.',
          };
    }
    return isLoadingPosts || postError || postReels.length > 0
      ? null
      : {
          variant: 'empty',
          title: '담긴 게시물이 아직 없어요',
          description: '릴스를 공유하고 게시물을 담아보세요.',
        };
  })();
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
    if (
      hasRestoredInitialScrollRef.current ||
      isLoading ||
      !hasSavedPlaces ||
      initialScrollOffsetRef.current <= 0
    ) {
      return;
    }

    const restoreScrollPosition = requestAnimationFrame(() => {
      hasRestoredInitialScrollRef.current = true;
      scrollViewRef.current?.scrollTo({
        y: initialScrollOffsetRef.current,
        animated: false,
      });
    });

    return () => cancelAnimationFrame(restoreScrollPosition);
  }, [hasSavedPlaces, isLoading]);

  useEffect(() => {
    return () => onEditModeChange?.(false);
  }, [onEditModeChange]);

  const fetchSavedPlaces = useCallback(
    async (showLoading: boolean) => {
      if (providedPlaces !== undefined) {
        if (isGuest) {
          cachedSavedPlaces = null;
        }
        setPlaces(providedPlaces);
        return providedPlaces;
      }

      const showLoadingState = showLoading || !hasLoadedPlacesRef.current;
      if (showLoadingState) setIsLoading(true);
      try {
        const savedPlaces = await getSavedPlaces();
        syncSavedPlaceFolderIds(savedPlaces);
        const nextPlaces = savedPlaces.map(toSavedPlaceDisplayPlace);
        cachedSavedPlaces = nextPlaces;
        hasLoadedPlacesRef.current = true;
        setPlaces(current =>
          JSON.stringify(current) === JSON.stringify(nextPlaces)
            ? current
            : nextPlaces,
        );
        setError(null);
        return nextPlaces;
      } catch (nextError) {
        const apiError = nextError as SavedPlacesApiError;
        if (showLoadingState) setError(apiError);
        if (apiError.errorCode === 'AUTH401_001') {
          onAuthenticationRequired?.();
        }
        return null;
      } finally {
        if (showLoadingState) setIsLoading(false);
      }
    },
    [isGuest, onAuthenticationRequired, providedPlaces],
  );

  const loadSavedPlaces = useCallback(
    () => fetchSavedPlaces(true),
    [fetchSavedPlaces],
  );

  const loadPostPage = useCallback(async (cursor?: HistoryCursor) => {
    if (cursor && isLoadingMorePostsRef.current) return;
    const requestId = ++postRequestIdRef.current;
    isLoadingMorePostsRef.current = true;
    setIsLoadingPosts(true);
    setPostError(null);
    try {
      const page = await getSavedMedia(cursor);
      if (requestId !== postRequestIdRef.current) return;
      setPostReels(current => cursor
        ? [...current, ...page.reels.filter(reel => !current.some(item => item.id === reel.id))]
        : page.reels);
      setPostCursor(page.nextCursor);
      return page;
    } catch (nextError) {
      if (requestId === postRequestIdRef.current) {
        setPostError((nextError as {message?: string}).message ?? '게시물을 불러오지 못했어요.');
      }
    } finally {
      if (requestId === postRequestIdRef.current) {
        isLoadingMorePostsRef.current = false;
        setIsLoadingPosts(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isGuest || !isScreenActive) {
      if (isGuest) {
        setPostReels([]);
        setPostCursor(null);
      }
      return;
    }
    loadPostPage().catch(() => undefined);
  }, [isGuest, isScreenActive, loadPostPage]);

  const refreshSavedPlaces = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    analytics.refreshed();

    try {
      await Promise.all([
        loadSavedPlaces(),
        isGuest ? Promise.resolve() : loadPostPage(),
        librarySearch.query !== null
          ? librarySearch.search(librarySearch.query)
          : Promise.resolve(),
      ]);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [analytics, isGuest, librarySearch, loadPostPage, loadSavedPlaces]);

  useEffect(() => {
    // Keep the already visible content while revalidating on return. Entering
    // a loading/error branch here changes the layout during the pop transition.
    if (isScreenActive) fetchSavedPlaces(false);
  }, [isScreenActive, fetchSavedPlaces]);

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

  useEffect(() => {
    if (isGuest) {
      return;
    }
    let isActive = true;
    const verifiedKeys = new Set<string>();
    const verificationInFlight = new Set<string>();

    const verifySharedReelBeforeShowing = async (
      state: NonNullable<ReturnType<typeof getSharedSaveState>>,
      verificationKey: string,
    ) => {
      verificationInFlight.add(verificationKey);
      setShareApiDiagnostics(current =>
        current
          ? {
              ...current,
              statusQueryCount: current.statusQueryCount + 1,
              lastQueriedAt: new Date(),
              queryFailureReason: null,
            }
          : current,
      );
      try {
        // 토큰 갱신과 401 재시도는 Spring API 클라이언트가 처리합니다.
        let currentStatus: ReelProcessingStatus | null;
        try {
          currentStatus = await getReelProcessingStatus(state.reel.id);
        } catch (statusError) {
          throw normalizeReelError(statusError);
        }

        if (!isActive) {
          return;
        }
        if (!currentStatus) {
          if (__DEV__) {
            console.warn('[InstagramShare][status-response]', {
              requestId: state.shareResultId ?? null,
              reelId: state.reel.id,
              result: null,
            });
          }
          setShareApiDiagnostics(current =>
            current
              ? {
                  ...current,
                  queriedStatus: null,
                  queryFailureReason: '조회 결과 없음',
                }
              : current,
          );
          setSharedSaveState(null);
          await onSharedResultConsumed?.(state.shareResultId);
          return;
        }

        verifiedKeys.add(verificationKey);
        verifiedKeys.add(`${currentStatus.id}:${currentStatus.created_at}`);
        if (__DEV__) {
          console.info('[InstagramShare][status-response]', {
            requestId: state.shareResultId ?? null,
            reelId: currentStatus.id,
            status: currentStatus.processing_status,
            failureReason: currentStatus.failure_reason,
          });
        }
        setShareApiDiagnostics(current =>
          current
            ? {
                ...current,
                queriedStatus: currentStatus.processing_status,
                queryFailureReason: currentStatus.failure_reason,
              }
            : current,
        );
        setSharedSaveState({
          ...state,
          status: currentStatus.processing_status,
          reel: currentStatus,
        });
      } catch (pollError) {
        const normalized = normalizeReelError(pollError);
        if (__DEV__) {
          console.warn('[InstagramShare][status-error]', {
            requestId: state.shareResultId ?? null,
            reelId: state.reel.id,
            errorCode: normalized.errorCode ?? null,
            message: normalized.message,
          });
        }
        setShareApiDiagnostics(current =>
          current
            ? {
                ...current,
                queryFailureReason: normalized.errorCode ?? normalized.message,
              }
            : current,
        );
        // 앱 진입 시 상태를 확인하지 못한 경우 추측으로 카드를 표시하지 않습니다.
      } finally {
        verificationInFlight.delete(verificationKey);
      }
    };

    const refreshAfterExternalShare = async (reelId: string, requestId?: string) => {
      let hasLoadedPlaces = false;
      for (let attempt = 0; attempt < COMPLETED_SAVE_REFRESH_DELAYS_MS.length; attempt += 1) {
        if (attempt > 0) {
          await new Promise<void>(resolve =>
            setTimeout(resolve, COMPLETED_SAVE_REFRESH_DELAYS_MS[attempt]),
          );
        }
        if (!isActive) return;
        const [loadedPlaces, page] = await Promise.all([loadSavedPlaces(), loadPostPage()]);
        if (!isActive) return;
        hasLoadedPlaces ||= loadedPlaces !== null;
        // 첫 완료 응답 뒤에도 한 번 더 확인합니다. 두 번째 조회가 아직 비어
        // 있으면 실제 공유 ID가 게시물 보관함에 나타날 때까지 재시도합니다.
        if (attempt > 0 && hasLoadedPlaces && page?.reels.some(reel => reel.id === reelId)) {
          await onSharedResultConsumed?.(requestId);
          return;
        }
      }
      if (hasLoadedPlaces && isActive) await onSharedResultConsumed?.(requestId);
    };

    const applySharedState = (state: ReturnType<typeof getSharedSaveState>) => {
      if (!state) {
        // 완료되어 소비했거나 새 공유 URL을 아직 찾지 못한 경우
        // 이전 요청의 진단 정보를 현재 요청처럼 남겨두지 않습니다.
        setShareApiDiagnostics(null);
        setProcessingReelId(null);
        setProcessingReel(null);
        setStatusQueryError(null);
        return;
      }

      const hasRealReelId = !state.reel.id.startsWith('share-');
      setShareApiDiagnostics(current =>
        current?.reelId === state.reel.id && current.requestUrl === state.url
          ? current
          : {
              source:
                state.source === 'instagram_share' ? 'url_input' : state.source,
              requestUrl: state.url,
              saveStatus: state.status,
              reelId: state.reel.id,
              reused: state.reused ?? null,
              saveFailureReason: state.reel.failure_reason,
              statusQueryCount: 0,
              lastQueriedAt: null,
              queriedStatus: null,
              queryFailureReason: null,
            },
      );
      if (
        (state.status === 'PENDING' || state.status === 'PROCESSING') &&
        !hasRealReelId
      ) {
        // Share Extension이 현재 requestId/URL로 API 응답을 기다리는 실제 상태입니다.
        // reelId가 오기 전에는 상태 API를 호출하지 않고 응답 대기 카드만 표시합니다.
        setProcessingReelId(null);
        setProcessingReel(state.reel);
        setStatusQueryError(null);
        setIsSaveResponseFailure(false);
        return;
      }

      const verificationKey = `${state.reel.id}:${state.reel.created_at}`;
      if (
        state.source === 'instagram_share' &&
        (state.status === 'PENDING' || state.status === 'PROCESSING') &&
        !verifiedKeys.has(verificationKey)
      ) {
        setProcessingReelId(null);
        setProcessingReel(null);
        setStatusQueryError(null);
        if (!verificationInFlight.has(verificationKey)) {
          verifySharedReelBeforeShowing(state, verificationKey).catch(
            () => undefined,
          );
        }
        return;
      }

      setProcessingReelId(
        (state.status === 'PROCESSING' || state.status === 'PENDING') &&
          hasRealReelId
          ? state.reel.id
          : null,
      );
      setProcessingReel(state.reel);
      setIsSaveResponseFailure(state.status === 'FAILED');
      setShowSaveSuccess(
        state.status === 'COMPLETED' && state.source === 'url_input',
      );
      if (state.status === 'COMPLETED' && state.source === 'url_input') {
        queueCompletedRefresh(state.reel.id);
      }
      if (state.status === 'COMPLETED') {
        if (state.source === 'instagram_share') {
          refreshAfterExternalShare(state.reel.id, state.shareResultId).catch(() => undefined);
          setSharedSaveState(null);
        }
        // URL 입력으로 접수한 항목은 히스토리 목록에 나타날 때까지 유지합니다.
        // 즉시 완료 응답에서 상태를 지우면 목록 반영 전 잠시 카드가 사라집니다.
      }
    };

    applySharedState(getSharedSaveState());
    const unsubscribe = subscribeSharedSaveState(applySharedState);
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [isGuest, loadPostPage, loadSavedPlaces, onSharedResultConsumed, queueCompletedRefresh]);

  const openDialog = () => {
    if (isGuest) {
      (onShowGuestLoginPrompt ?? onRequireLogin)?.();
      return;
    }
    analytics.button('add_link');
    analytics.modal('link_dialog');
    setLinkError(null);
    setIsDialogVisible(true);
  };

  const closeDialog = () => {
    if (isSubmitting) {
      return;
    }
    analytics.button('link_dialog_close');
    setIsDialogVisible(false);
    setLinkValue('');
    setLinkError(null);
  };

  const handleSaveLink = async () => {
    if (isSubmitting) {
      return;
    }

    analytics.button('link_dialog_submit');
    const normalizedUrl =
      normalizeInstagramContentUrl(linkValue) ?? linkValue.trim();
    saveRequestIdRef.current = uuidv4();
    const clientRequestId = saveRequestIdRef.current;
    const initialReel: ReelProcessingStatus = {
      id: `manual-${Date.now()}`,
      processing_status: 'PROCESSING',
      failure_reason: null,
      instagram_thumbnail_url: null,
      created_at: new Date().toISOString(),
    };

    // 새 링크 요청은 이전 릴스의 카드/폴링 상태를 이어받지 않습니다.
    setProcessingReelId(null);
    setProcessingReel(initialReel);
    setStatusQueryError(null);
    setIsSaveResponseFailure(false);
    setShowSaveSuccess(false);
    setSharedSaveState({
      url: normalizedUrl,
      status: 'PROCESSING',
      source: 'url_input',
      reel: initialReel,
    });
    setIsSubmitting(true);
    setLinkError(null);
    try {
      const response = await saveContent(
        linkValue,
        'url_input',
        clientRequestId,
      );
      const nextReel: ReelProcessingStatus = {
        id: response.reelId,
        processing_status: response.status,
        failure_reason: response.failureReason ?? null,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      };
      setSharedSaveState({
        url: normalizedUrl,
        status: response.status,
        source: 'url_input',
        reused: response.reused,
        reel: nextReel,
      });
      trackActionFinished(posthog, 'link_save_request', 'success', {
        source: 'url_input',
        status: response.status,
        reused: response.reused ?? false,
      });
      handleSaveResponse(response, normalizedUrl, 'url_input');
      setIsDialogVisible(false);
      setLinkValue('');
      // v2 대기함 흐름 복원 시:
      // if (response.saveMode === 'REVIEW_QUEUE') onOpenInbox?.();
    } catch (submitError) {
      const normalizedError = normalizeReelError(submitError);
      trackActionFinished(posthog, 'link_save_request', 'failure', {
        source: 'url_input',
        failure_type: normalizedError.errorCode,
      });
      setLastRequestId(normalizedError.requestId ?? null);
      const failedReel: ReelProcessingStatus = {
        id: `manual-failed-${Date.now()}`,
        processing_status: 'FAILED',
        failure_reason: normalizedError.errorCode,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      };
      setProcessingReel(failedReel);
      setSharedSaveState({
        url: normalizedUrl,
        status: 'FAILED',
        source: 'url_input',
        reel: failedReel,
      });
      setIsSaveResponseFailure(true);
      if (normalizedError.errorCode === 'AUTH401_001') {
        setIsDialogVisible(false);
        onRequireLogin?.();
        return;
      }

      setLinkError(normalizedError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveResponse = (
    response: Awaited<ReturnType<typeof saveContent>>,
    url: string,
    source: SaveSource,
  ) => {
    if (response.status === 'COMPLETED') {
      setIsSaveResponseFailure(false);
      setProcessingReelId(null);
      setProcessingReel({
        id: response.reelId,
        processing_status: 'COMPLETED',
        failure_reason: null,
        instagram_thumbnail_url: null,
        created_at: new Date().toISOString(),
      });
      setShowSaveSuccess(source === 'url_input');
      if (source === 'url_input') queueCompletedRefresh(response.reelId);
      return;
    }

    // REEL-01의 200 FAILED 결과는 reused 값과 관계없이 재시도 UI를 표시합니다.
    setIsSaveResponseFailure(response.status === 'FAILED');
    setProcessingReelId(response.reelId);
    setProcessingReel({
      id: response.reelId,
      processing_status: response.status,
      failure_reason: response.failureReason ?? null,
      instagram_thumbnail_url: null,
      created_at: new Date().toISOString(),
    });
  };

  useEffect(() => {
    if (!processingReelId) {
      reelPollStartedAtRef.current = null;
      reelPollFailureCountRef.current = 0;

      if (
        processingReel?.processing_status === 'PENDING' &&
        processingReel.id.startsWith('share-')
      ) {
        const createdAt = Date.parse(processingReel.created_at);
        const elapsed = Number.isFinite(createdAt) ? Date.now() - createdAt : 0;
        const timeoutId = setTimeout(() => {
          setStatusQueryError(
            new ReelApiError({
              errorCode: 'CLIENT000_002',
              message: '공유 저장 요청의 응답이 늦어지고 있어요.',
              retryable: true,
            }),
          );
          setIsSaveResponseFailure(true);
        }, Math.max(0, 30_000 - elapsed));
        return () => clearTimeout(timeoutId);
      }
      return;
    }

    if (processingReel?.processing_status === 'FAILED') {
      reelPollStartedAtRef.current = null;
      reelPollFailureCountRef.current = 0;
      return;
    }

    let isActive = true;
    const persistedStartedAt = Date.parse(processingReel?.created_at ?? '');
    reelPollStartedAtRef.current ??= Number.isFinite(persistedStartedAt)
      ? Math.min(persistedStartedAt, Date.now())
      : Date.now();
    const poll = async (recentReels: Promise<HistoryReel[]>) => {
      if (!isActive) return;
      if (
        Date.now() - (reelPollStartedAtRef.current ?? Date.now()) >=
        REEL_POLL_TIMEOUT_MS
      ) {
        if (isActive) {
          const timeoutError = new ReelApiError({
            errorCode: 'CLIENT000_002',
            message: '처리 시간이 너무 오래 걸리고 있어요. 다시 시도해주세요.',
            retryable: true,
          });
          setStatusQueryError(timeoutError);
          setIsSaveResponseFailure(true);
          setProcessingReelId(null);
        }
        return;
      }
      try {
        setShareApiDiagnostics(current =>
          current
            ? {
                ...current,
                statusQueryCount: current.statusQueryCount + 1,
                lastQueriedAt: new Date(),
                queryFailureReason: null,
              }
            : current,
        );
        let nextStatus: ReelProcessingStatus | null;
        try {
          // 서버에 단건 상태 조회 API가 없어 공유 목록 첫 페이지에서 찾습니다.
          const reel = (await recentReels).find(
            item => item.id === processingReelId,
          );
          nextStatus = reel
            ? {
                id: reel.id,
                processing_status: reel.processing_status,
                failure_reason: reel.failure_reason,
                instagram_thumbnail_url: reel.instagram_thumbnail_url,
                created_at: reel.created_at,
              }
            : null;
        } catch (statusError) {
          throw normalizeReelError(statusError);
        }

        if (isActive && !nextStatus) {
          if (__DEV__) {
            console.warn('[InstagramShare][status-response]', {
              reelId: processingReelId,
              result: null,
            });
          }
          setShareApiDiagnostics(current =>
            current
              ? {
                  ...current,
                  queriedStatus: null,
                  queryFailureReason: '조회 결과 없음',
                }
              : current,
          );
          reelPollFailureCountRef.current += 1;
          if (reelPollFailureCountRef.current >= REEL_POLL_FAILURE_LIMIT) {
            setStatusQueryError(
              new ReelApiError({
                errorCode: 'CLIENT000_003',
                message: '처리 중인 릴스 상태를 확인하지 못했어요.',
                retryable: true,
              }),
            );
            setIsSaveResponseFailure(true);
            setProcessingReelId(null);
          }
          return;
        }

        if (isActive && nextStatus) {
          reelPollFailureCountRef.current = 0;
          setStatusQueryError(null);
          setProcessingReel(nextStatus);
          if (__DEV__) {
            console.info('[InstagramShare][status-response]', {
              reelId: nextStatus.id,
              status: nextStatus.processing_status,
              failureReason: nextStatus.failure_reason,
            });
          }
          setShareApiDiagnostics(current =>
            current
              ? {
                  ...current,
                  queriedStatus: nextStatus.processing_status,
                  queryFailureReason: nextStatus.failure_reason,
                }
              : current,
          );
          const sharedState = getSharedSaveState();
          if (sharedState?.reel.id === nextStatus.id) {
            setSharedSaveState({
              ...sharedState,
              status: nextStatus.processing_status,
              reel: nextStatus,
            });
          }
          if (nextStatus.processing_status === 'COMPLETED') {
            setProcessingReelId(null);
            setShowSaveSuccess(sharedState?.source === 'url_input');
            if (sharedState?.source === 'url_input') {
              queueCompletedRefresh(nextStatus.id);
            }
          }
        }
      } catch (pollError) {
        if (isActive) {
          reelPollFailureCountRef.current += 1;
          const normalizedError = normalizeReelError(pollError);
          if (__DEV__) {
            console.warn('[InstagramShare][status-error]', {
              reelId: processingReelId,
              errorCode: normalizedError.errorCode ?? null,
              message: normalizedError.message,
              attempt: reelPollFailureCountRef.current,
            });
          }
          setShareApiDiagnostics(current =>
            current
              ? {
                  ...current,
                  queryFailureReason:
                    normalizedError.errorCode ?? normalizedError.message,
                }
              : current,
          );
          setStatusQueryError(normalizedError);
          if (normalizedError.errorCode === 'AUTH401_001') {
            setProcessingReelId(null);
            onRequireLogin?.();
          } else if (normalizedError.errorCode === 'AUTH403_001') {
            setProcessingReelId(null);
          } else if (
            !normalizedError.retryable ||
            reelPollFailureCountRef.current >= REEL_POLL_FAILURE_LIMIT
          ) {
            setProcessingReelId(null);
            setIsSaveResponseFailure(true);
          }
        }
      }
    };

    // 히스토리 화면·배지와 같은 앱 공용 목록 폴러를 3초 주기로 구독합니다.
    const subscription = subscribeRecentShares({
      intervalMs: REEL_POLL_INTERVAL_MS,
      onResult: ({ reels }) => {
        poll(Promise.resolve(reels)).catch(() => undefined);
      },
      onError: pollError => {
        poll(Promise.reject(pollError)).catch(() => undefined);
      },
    });
    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [
    onRequireLogin,
    processingReel?.created_at,
    processingReel?.id,
    processingReel?.processing_status,
    processingReelId,
    queueCompletedRefresh,
    error,
  ]);

  useEffect(() => {
    if (isGuest) {
      setSharedReels([]);
      completedShareIdsRef.current = null;
      return;
    }
    // 히스토리와 같은 공용 폴러에서 완료 전환을 보면 게시물·장소도 갱신합니다.
    const subscription = subscribeRecentShares({
      intervalMs: RECENT_SHARES_INTERVAL_MS,
      onResult: ({ reels }) => {
        setSharedReels(reels);
        const completedIds = new Set(
          reels.filter(reel => reel.processing_status === 'COMPLETED').map(reel => reel.id),
        );
        const previousIds = completedShareIdsRef.current;
        completedShareIdsRef.current = completedIds;
        const newlyCompleted = previousIds
          ? reels.filter(reel =>
              reel.processing_status === 'COMPLETED' && !previousIds.has(reel.id),
            )
          : reels.filter(reel => reel.processing_status === 'COMPLETED').slice(0, 1);
        // 첫 목록에는 과거 완료 항목도 많으므로 최신 한 건만 재확인합니다.
        newlyCompleted.forEach(reel => queueCompletedRefresh(reel.id));
      },
    });
    return () => {
      subscription.unsubscribe();
      completedShareIdsRef.current = null;
    };
  }, [isGuest, queueCompletedRefresh]);

  // 방금 저장한 릴스는 서버 목록에 잡히기 전에도 "최근 공유" 줄에 보여 줍니다.
  // 서버가 접수한 실패 항목은 보여 주되, 요청 자체가 실패한 임시 카드는 숨깁니다.
  // 공유 확장의 실패 결과는 기기에 남아 앱을 켤 때 복원되므로 서버 목록에 있을 때만 보여 줍니다.
  const recentRowReels = useMemo(() => {
    if (
      !processingReel ||
      (processingReel.processing_status === 'FAILED' &&
        (processingReel.id.startsWith('manual-failed-') ||
          getSharedSaveState()?.source !== 'url_input')) ||
      sharedReels.some(reel => reel.id === processingReel.id)
    ) {
      return sharedReels;
    }
    const pendingReel: HistoryReel = {
      id: processingReel.id,
      instagram_url: null,
      instagram_title: null,
      instagram_description: null,
      instagram_author_username: null,
      instagram_thumbnail_url: processingReel.instagram_thumbnail_url,
      processing_status: processingReel.processing_status,
      failure_reason: null,
      save_mode: null,
      created_at: processingReel.created_at,
    };
    return [pendingReel, ...sharedReels];
  }, [processingReel, sharedReels]);

  useEffect(() => {
    if (isGuest || !isScreenActive || completedRefreshIds.length === 0) {
      return;
    }

    // 완료 응답과 보관함 목록 반영 사이에 시차가 있을 수 있습니다.
    // 게시물은 실제 공유 ID가 나타날 때까지, 장소는 추출 결과가 0건일 수도
    // 있으므로 짧은 기간 동안 다시 읽습니다.
    let cancelled = false;
    const postVisibleIds = new Set<string>();
    const targetIds = completedRefreshIds;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const refresh = async (attempt: number) => {
      const [, page] = await Promise.all([
        loadSavedPlaces(),
        postVisibleIds.size === targetIds.length
          ? Promise.resolve(undefined)
          : loadPostPage(),
      ]);
      if (cancelled) return;
      page?.reels.forEach(reel => {
        if (targetIds.includes(reel.id)) postVisibleIds.add(reel.id);
      });
      if (attempt + 1 < COMPLETED_SAVE_REFRESH_DELAYS_MS.length) {
        timeoutId = setTimeout(
          () => refresh(attempt + 1).catch(() => undefined),
          COMPLETED_SAVE_REFRESH_DELAYS_MS[attempt + 1],
        );
      } else {
        setCompletedRefreshIds(current => current.filter(id => !targetIds.includes(id)));
      }
    };
    refresh(0).catch(() => undefined);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [completedRefreshIds, isGuest, isScreenActive, loadPostPage, loadSavedPlaces]);

  useEffect(() => {
    if (!showSaveSuccess) return;
    const timeoutId = setTimeout(() => setShowSaveSuccess(false), 1800);
    return () => clearTimeout(timeoutId);
  }, [showSaveSuccess]);

  const handlePressEdit = useCallback(() => {
    const next = !isEditing;
    analytics.button(next ? 'edit_start' : 'edit_cancel');
    setIsEditing(next);
    setSelectedPlaceIds(new Set());
    onEditModeChange?.(next);
  }, [analytics, isEditing, onEditModeChange]);

  const handleChangeLibraryView = useCallback(
    (next: SavedLibraryView) => {
      if (next === libraryView) {
        return;
      }
      analytics.selection('library_view', next);
      if (isEditing) {
        setIsEditing(false);
        setSelectedPlaceIds(new Set());
        onEditModeChange?.(false);
      }
      if (isEditingPosts) {
        setIsEditingPosts(false);
        setSelectedPostIds(new Set());
        onEditModeChange?.(false);
      }
      setLibraryView(next);
    },
    [analytics, isEditing, isEditingPosts, libraryView, onEditModeChange],
  );

  const handlePressEditPosts = useCallback(() => {
    const next = !isEditingPosts;
    analytics.button(next ? 'post_edit_start' : 'post_edit_cancel');
    setIsEditingPosts(next);
    setSelectedPostIds(new Set());
    onEditModeChange?.(next);
  }, [analytics, isEditingPosts, onEditModeChange]);

  // 장소 탭처럼 게시물을 길게 누르면 편집을 시작합니다.
  const enterPostEditMode = useCallback(() => {
    analytics.button('post_edit_long_press');
    setIsEditingPosts(true);
    setSelectedPostIds(new Set());
    onEditModeChange?.(true);
  }, [analytics, onEditModeChange]);

  const togglePostSelection = useCallback(
    (reelId: string) => {
      analytics.button('toggle_post_selection');
      setSelectedPostIds(current => {
        const next = new Set(current);
        if (next.has(reelId)) {
          next.delete(reelId);
        } else {
          next.add(reelId);
        }
        return next;
      });
    },
    [analytics],
  );

  const handleDeleteSelectedPosts = useCallback(async () => {
    if (isDeleting || selectedPostIds.size === 0) return;
    const ids = [...selectedPostIds];
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSavedMedia(ids);
      const deletedUrls = new Set(
        [...postReels, ...librarySearch.reels]
          .filter(reel => selectedPostIds.has(reel.id))
          .map(reel => reel.instagram_url)
          .filter((url): url is string => url != null),
      );
      setSharedReels(current => current.map(reel =>
        selectedPostIds.has(reel.id) || (reel.instagram_url != null && deletedUrls.has(reel.instagram_url))
          ? {...reel, deleted_from_library: true}
          : reel,
      ));
      setPostReels(current => current.filter(reel => !selectedPostIds.has(reel.id)));
      librarySearch.removeReels(selectedPostIds);
      setSelectedPostIds(new Set());
      setIsEditingPosts(false);
      onEditModeChange?.(false);
      await Promise.all([loadPostPage(), loadSavedPlaces()]);
    } catch (nextError) {
      setDeleteError(nextError as SavedPlacesApiError);
    } finally {
      setIsDeleting(false);
    }
  }, [
    isDeleting,
    librarySearch,
    loadPostPage,
    loadSavedPlaces,
    onEditModeChange,
    postReels,
    selectedPostIds,
  ]);

  const confirmDeleteSelectedPosts = useCallback(() => {
    if (isDeleting || selectedPostIds.size === 0) return;
    const count = selectedPostIds.size;
    showAlert(
      '선택한 게시물을 삭제할까요?',
      `선택한 ${count}개의 게시물이 보관함에서 삭제됩니다. 이 게시물에만 담긴 장소는 장소 보관함과 지도에서 사라져요.`,
      [
        {text: '취소', style: 'cancel'},
        {text: '삭제', style: 'destructive', onPress: () => {
          handleDeleteSelectedPosts().catch(() => undefined);
        }},
      ],
    );
  }, [handleDeleteSelectedPosts, isDeleting, selectedPostIds.size]);

  const handleOpenHistory = useCallback(() => {
    analytics.button('open_history');
    onOpenHistory?.();
  }, [analytics, onOpenHistory]);

  const handleOpenReel = useCallback(
    (reel: HistoryReel) => {
      analytics.button('open_reel_detail');
      if (onOpenReel) {
        onOpenReel(reel);
        return;
      }
      onOpenHistory?.();
    },
    [analytics, onOpenHistory, onOpenReel],
  );

  // 방금 공유한 릴스: 실패한 공유는 해당 실패 상세로 바로 보냅니다.
  const handleOpenRecentReel = useCallback(
    (reel: HistoryReel) => {
      if (reel.deleted_from_library) {
        showAlert('보관함에서 삭제한 게시물이에요.');
        return;
      }
      if (reel.processing_status !== 'FAILED') {
        handleOpenReel(reel);
        return;
      }
      analytics.button('open_reel_detail');
      if (onOpenFailedReel) onOpenFailedReel(reel);
      else handleOpenHistory();
    },
    [analytics, handleOpenHistory, handleOpenReel, onOpenFailedReel],
  );

  const enterEditMode = useCallback(() => {
    analytics.button('edit_long_press');
    setIsEditing(true);
    setSelectedPlaceIds(new Set());
    onEditModeChange?.(true);
  }, [analytics, onEditModeChange]);

  const togglePlaceSelection = useCallback((placeId: string) => {
    analytics.button('toggle_place_selection');
    setSelectedPlaceIds(current => {
      const next = new Set(current);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }
      return next;
    });
  }, [analytics]);

  const handleDeleteSelectedPlaces = useCallback(async () => {
    if (isDeleting || selectedPlaceIds.size === 0) {
      return;
    }

    const deleteCount = selectedPlaceIds.size;
    if (isGuest) {
      setPlaces(current =>
        current.filter(place => !selectedPlaceIds.has(place.id)),
      );
      librarySearch.removePlaces(place => selectedPlaceIds.has(place.id));
      onDeleteGuestPlaces?.([...selectedPlaceIds]);
      setSelectedPlaceIds(new Set());
      setIsEditing(false);
      onEditModeChange?.(false);
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
      trackActionFinished(posthog, 'saved_places_delete', 'success', {
        count: deleteCount,
      });
      const deletedIds = new Set(savedPlaceIds);
      setPlaces(current =>
        current.filter(place => !deletedIds.has(place.savedPlaceId ?? '')),
      );
      librarySearch.removePlaces(place =>
        deletedIds.has(place.savedPlaceId ?? ''),
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
          refreshedPlaces.every(
            place => !deletedIds.has(place.savedPlaceId ?? ''),
          );

        if (isDeletionConfirmed) {
          setSelectedPlaceIds(new Set());
          setIsEditing(false);
          onEditModeChange?.(false);
          return;
        }
      }

      trackActionFinished(posthog, 'saved_places_delete', 'failure', {
        count: deleteCount,
        failure_type: apiError.errorCode,
      });
      setDeleteError(apiError);
      if (
        apiError.errorCode === 'AUTH401_001' ||
        apiError.errorCode === 'AUTH401_002'
      ) {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsDeleting(false);
    }
  }, [
    isDeleting,
    isGuest,
    librarySearch,
    loadSavedPlaces,
    onAuthenticationRequired,
    onDeleteGuestPlaces,
    onEditModeChange,
    places,
    posthog,
    selectedPlaceIds,
  ]);

  const confirmDeleteSelectedPlaces = useCallback(() => {
    if (isDeleting || selectedPlaceIds.size === 0) {
      return;
    }

    const count = selectedPlaceIds.size;
    analytics.button('delete_selected', {count});
    analytics.modal('delete_confirm', {count});
    showAlert(
      '선택한 장소의 북마크를 해제할까요?',
      `선택한 ${count}곳이 장소 보관함과 지도에서 사라져요. 해당 게시물에서 다시 북마크할 수 있어요.`,
      [
        {
          text: '취소',
          style: 'cancel',
          onPress: () => analytics.button('delete_confirm_cancel', {count}),
        },
        {
          text: '북마크 해제',
          onPress: () => {
            analytics.button('delete_confirm_ok', {count});
            handleDeleteSelectedPlaces().catch(() => undefined);
          },
        },
      ],
    );
  }, [analytics, handleDeleteSelectedPlaces, isDeleting, selectedPlaceIds.size]);

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

  const submitSearch = useCallback(
    (query: string, method: SavedPlacesSearchMethod) => {
      const searchId = uuidv4();
      activeSearchIdRef.current = searchId;
      setIsSearchOpen(false);
      saveRecentSearch(query);
      scrollViewRef.current?.scrollTo({ y: 0, animated: false });
      librarySearch
        .search(query)
        .then(result => {
          if (!result || activeSearchIdRef.current !== searchId) return;
          captureSavedPlacesSearchSubmitted(posthog, {
            searchId,
            searchMethod: method,
            resultCount: result.placeCount + result.reelCount,
          });
        })
        .catch(() => undefined);
    },
    [librarySearch, posthog, saveRecentSearch],
  );

  const clearSearch = useCallback(() => {
    activeSearchIdRef.current = null;
    librarySearch.clear();
  }, [librarySearch]);

  const closeNestedScreen = useCallback(() => {
    if (isSearchOpen) setIsSearchOpen(false);
    else if (isEditing) handlePressEdit();
    else if (isEditingPosts) handlePressEditPosts();
    else if (isSearching) clearSearch();
  }, [
    clearSearch,
    handlePressEdit,
    handlePressEditPosts,
    isEditing,
    isEditingPosts,
    isSearchOpen,
    isSearching,
  ]);
  useEffect(() => {
    const canGoBack =
      isScreenActive &&
      (isSearchOpen || isEditing || isEditingPosts || isSearching);
    onNestedBackStateChange?.(canGoBack);
    if (Platform.OS !== 'android' || !canGoBack) {
      return () => onNestedBackStateChange?.(false);
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        closeNestedScreen();
        return true;
      },
    );
    return () => {
      subscription.remove();
      onNestedBackStateChange?.(false);
    };
  }, [
    closeNestedScreen,
    isScreenActive,
    isEditing,
    isEditingPosts,
    isSearchOpen,
    isSearching,
    onNestedBackStateChange,
  ]);
  const updateBarVisibility = (
    offsetY: number,
    metrics: { contentHeight?: number; viewportHeight?: number },
  ) => {
    const next = reduceBarScroll(barScrollStateRef.current, offsetY, metrics);
    barScrollStateRef.current = next;
    const target = next.visible ? 1 : 0;
    if (barRevealTargetRef.current === target) {
      return;
    }
    barRevealTargetRef.current = target;
    Animated.timing(barReveal, {
      toValue: target,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  // 장소/게시물 토글과 카테고리 칩. 스크롤 내용 안에 한 번(자리 확보), 위에 겹쳐 한 번 그립니다.
  const libraryBar = (
    <View style={styles.libraryBar}>
      <SavedPlacesViewToggle
        view={libraryView}
        onChangeView={handleChangeLibraryView}
        isEditing={libraryView === 'places' ? isEditing : isEditingPosts}
        onPressEdit={
          libraryView === 'places' ? handlePressEdit : handlePressEditPosts
        }
      />
      {libraryView === 'places' ? (
        <CategoryFilterChips
          categories={PLACE_CATEGORIES}
          selectedCategory={activeCategory}
          onSelectCategory={category => {
            analytics.selection('category_filter', category);
            setSelectedCategory(category);
          }}
          style={styles.categoryChips}
        />
      ) : null}
    </View>
  );
  const stickOffset = error || deleteError ? 0 : SAVED_HEADER_HEIGHT;
  // 검색 헤더와 바는 붙은 채로 함께 숨고 나타나므로, 둘 다 헤더와 바를 더한 높이만큼 숨깁니다.
  const libraryHideDistance =
    stickOffset + (libraryBarLayout?.height ?? 0);
  const savedPlacesHeader = (
    <SavedPlacesHeader
      query={librarySearch.query}
      onPressSearch={() => {
        // 지도 검색창처럼 비회원에게는 검색 대신 로그인을 안내합니다.
        if (isGuest) {
          analytics.button('guest_search');
          (onShowGuestLoginPrompt ?? onRequireLogin)?.();
          return;
        }
        analytics.button('open_search');
        setIsSearchOpen(true);
      }}
      onClearSearch={() => {
        analytics.button('clear_search');
        clearSearch();
      }}
    />
  );

  const renderListContent = () => (
    <View style={styles.container}>
      {/* 배너가 있을 때는 헤더가 사라지면 배너 위가 비므로 고정합니다. */}
      {hasSavedPlaces && stickOffset > 0 && libraryBarLayout !== null ? (
        <SavedPlacesStickyBar
          hideDistance={libraryHideDistance}
          naturalTop={0}
          reveal={barReveal}
          scrollY={scrollY}
          stickOffset={0}
          style={[styles.header, styles.headerOverlay]}
        >
          {savedPlacesHeader}
        </SavedPlacesStickyBar>
      ) : (
        <View
          style={[styles.header, hasSavedPlaces && styles.headerOverlay]}
        >
          {savedPlacesHeader}
        </View>
      )}
      {error && hasSavedPlaces ? (
        <View
          style={[
            styles.errorBanner,
            hasSavedPlaces && styles.bannerBelowHeader,
          ]}
        >
          <Text numberOfLines={1} style={styles.errorText}>
            {error.message}
          </Text>
          {error.retryable ? (
            <Pressable
              onPress={() => {
                analytics.button('retry_load_banner');
                loadSavedPlaces();
              }}>
              <Text style={styles.errorRetryText}>재시도</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {deleteError ? (
        <View
          style={[
            styles.deleteErrorBanner,
            hasSavedPlaces && !(error && hasSavedPlaces) && styles.bannerBelowHeader,
          ]}
        >
          <Text numberOfLines={2} style={styles.deleteErrorText}>
            {deleteError.message}
          </Text>
          {deleteError.retryable ? (
            <Pressable
              onPress={() => {
                analytics.button('retry_delete');
                handleDeleteSelectedPlaces();
              }}>
              <Text style={styles.deleteErrorRetryText}>재시도</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {isLoading && !hasSavedPlaces ? (
        <SavedPlacesSkeleton />
      ) : hasSavedPlaces ? (
        <View style={styles.listArea}>
          <ScrollView
            ref={scrollViewRef}
            alwaysBounceVertical
            contentContainerStyle={[
              styles.scrollContent,
              // 헤더가 내용 위에 떠 있으므로, 배너가 없을 때만 헤더 높이만큼 비워 둡니다.
              !(error || deleteError) && { paddingTop: SAVED_HEADER_HEIGHT },
              emptyResult !== null && styles.scrollContentFill,
            ]}
            onScroll={event => {
              const { contentOffset, contentSize, layoutMeasurement } =
                event.nativeEvent;
              scrollY.setValue(contentOffset.y);
              onScrollOffsetChange?.(contentOffset.y);
              updateBarVisibility(contentOffset.y, {
                contentHeight: contentSize?.height,
                viewportHeight: layoutMeasurement?.height,
              });
              const isNearBottom =
                contentSize.height - (contentOffset.y + layoutMeasurement.height) < 240;
              if (libraryView === 'posts' && isNearBottom) {
                if (isSearching) {
                  librarySearch.loadMoreReels();
                } else if (postCursor && !isLoadingMorePostsRef.current) {
                  loadPostPage(postCursor).catch(() => undefined);
                }
              }
            }}
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
            <SavedPlacesRecentShares
              reels={recentRowReels}
              onPressReel={handleOpenRecentReel}
              onPressViewAll={handleOpenHistory}
              onPressAdd={openDialog}
            />
            <View
              accessibilityElementsHidden={libraryBarLayout !== null}
              importantForAccessibility={
                libraryBarLayout !== null ? 'no-hide-descendants' : 'auto'
              }
              onLayout={event =>
                setLibraryBarLayout({
                  top: event.nativeEvent.layout.y,
                  height: event.nativeEvent.layout.height,
                })
              }
              pointerEvents={libraryBarLayout !== null ? 'none' : 'auto'}
              style={libraryBarLayout !== null && styles.libraryBarPlaceholder}
            >
              {libraryBar}
            </View>
            {emptyResult !== null ? (
              <SavedPlacesEmptyResult
                description={emptyResult.description}
                title={emptyResult.title}
                variant={emptyResult.variant}
              />
            ) : libraryView === 'places' ? (
              <>
                <SavedPlaceGrid
                  isEditing={isEditing}
                  places={filteredPlaces}
                  onLongPressPlace={enterEditMode}
                  onPressPlace={(place, position) =>
                    isSearching
                      ? openPlaceDetail(
                          place,
                          'saved_places_search',
                          position,
                          activeSearchIdRef.current ?? undefined,
                        )
                      : openPlaceDetail(place, 'saved_places_grid', position)
                  }
                  onTogglePlaceSelection={togglePlaceSelection}
                  selectedPlaceIds={selectedPlaceIds}
                />
                {isSearching && librarySearch.isLoadingPlaces ? (
                  <Text style={styles.categoryEmptyText}>검색하고 있어요.</Text>
                ) : isSearching && librarySearch.placeError ? (
                  <Pressable onPress={librarySearch.retryPlaces}>
                    <Text style={styles.categoryEmptyText}>
                      {librarySearch.placeError} 다시 시도하기
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <SavedPostGrid
                  isEditing={isEditingPosts}
                  reels={visiblePostReels}
                  onLongPressReel={enterPostEditMode}
                  onPressReel={handleOpenReel}
                  onToggleReelSelection={togglePostSelection}
                  selectedReelIds={selectedPostIds}
                />
                {isSearching ? (
                  librarySearch.isLoadingReels ? (
                    <Text style={styles.categoryEmptyText}>검색하고 있어요.</Text>
                  ) : librarySearch.reelError ? (
                    <Pressable onPress={librarySearch.retryReels}>
                      <Text style={styles.categoryEmptyText}>
                        {librarySearch.reelError} 다시 시도하기
                      </Text>
                    </Pressable>
                  ) : null
                ) : isLoadingPosts ? (
                  <Text style={styles.categoryEmptyText}>게시물을 불러오고 있어요.</Text>
                ) : postError ? (
                  <Pressable onPress={() => loadPostPage(postCursor ?? undefined)}>
                    <Text style={styles.categoryEmptyText}>{postError} 다시 시도하기</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </ScrollView>
          {libraryBarLayout !== null ? (
            <SavedPlacesStickyBar
              hideDistance={libraryHideDistance}
              naturalTop={libraryBarLayout.top}
              reveal={barReveal}
              scrollY={scrollY}
              stickOffset={stickOffset}
            >
              {libraryBar}
            </SavedPlacesStickyBar>
          ) : null}
        </View>
      ) : error ? (
        <SavedPlacesErrorState
          error={error}
          onRetry={() => {
            analytics.button('retry_load');
            loadSavedPlaces();
          }}
        />
      ) : (
        <SavedPlacesEmptyState
          isGuest={isGuest}
          onLogin={() => {
            analytics.button('empty_login');
            onAuthenticationRequired?.();
          }}
          onOpenGuide={() => {
            analytics.button('empty_open_guide');
            onOpenGuide?.();
          }}
        />
      )}
      {isEditing || isEditingPosts ? (
        <Pressable
          accessibilityLabel={
            isEditingPosts
              ? selectedPostIds.size > 0 ? '선택한 게시물 삭제하기' : '게시물 편집 취소'
              : selectedPlaceIds.size > 0 ? '선택한 장소 북마크 해제하기' : '보관함 편집 취소'
          }
          accessibilityRole="button"
          disabled={isDeleting}
          onPress={isEditingPosts
            ? selectedPostIds.size === 0 ? handlePressEditPosts : confirmDeleteSelectedPosts
            : selectedPlaceIds.size === 0 ? handlePressEdit : confirmDeleteSelectedPlaces}
          style={({ pressed }) => [
            bottomNavigationBarContainerStyle,
            styles.deleteAction,
            { bottom: bottomActionOffset },
            isDeleting && styles.deleteActionDisabled,
            pressed && styles.deleteActionPressed,
          ]}
        >
          <View
            key="saved-places-delete-action-content"
            style={styles.deleteActionContent}
          >
            <Text style={styles.deleteActionText}>
              {(isEditingPosts ? selectedPostIds.size : selectedPlaceIds.size) > 0
                ? isEditingPosts
                  ? isDeleting ? '삭제 중...' : '삭제하기'
                  : isDeleting ? '해제 중...' : '북마크 해제'
                : '취소'}
            </Text>
            {(isEditingPosts ? selectedPostIds.size : selectedPlaceIds.size) > 0 ? (
              <View style={styles.deleteCountBadge}>
                <Text style={styles.deleteCountText}>
                  {isEditingPosts ? selectedPostIds.size : selectedPlaceIds.size}
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
  return (
    <View style={styles.container}>
      <SwipeBackStack
        activeKey={isSearchOpen ? 'search' : 'list'}
        backKey={isSearchOpen ? 'list' : null}
        enabled={isScreenActive}
        onBack={closeNestedScreen}
        screens={[
          { key: 'list', content: renderListContent() },
          ...(isSearchOpen
            ? [
                {
                  key: 'search',
                  content: (
                    <SavedPlacesSearchPanel
                      initialQuery={librarySearch.query ?? ''}
                      recentSearches={recentSearches}
                      onCloseSearch={() => {
                        analytics.button('close_search');
                        setIsSearchOpen(false);
                      }}
                      onSubmitSearch={submitSearch}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
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
  categoryEmptyText: {
    textAlign: 'center',
    marginTop: 80,
    fontSize: 15,
    color: '#8A8FA8',
  },
  // 검색 헤더(좌우 24)를 시안의 좌우 여백(20)에 맞춥니다.
  header: {
    marginHorizontal: -(24 - LIBRARY_GUTTER),
  },
  // 스크롤 내용 위에 떠 있는 헤더입니다. 흰 배경으로 내용이 뒤에 비치지 않게 합니다.
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#ffffff',
  },
  bannerBelowHeader: {
    marginTop: SAVED_HEADER_HEIGHT,
  },
  scrollContent: {
    gap: 16,
    paddingTop: 0,
  },
  scrollContentFill: {
    flexGrow: 1,
  },
  listArea: {
    flex: 1,
  },
  libraryBar: {
    gap: 16,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
  },
  libraryBarPlaceholder: {
    opacity: 0,
  },
  // 칩 목록의 기본 좌우 여백(24)을 시안의 20에 맞춥니다.
  categoryChips: {
    marginHorizontal: -(24 - LIBRARY_GUTTER),
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
});
