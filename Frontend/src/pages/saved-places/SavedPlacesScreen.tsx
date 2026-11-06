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
  captureSavedPlacesViewed,
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
import { SavedPlacesSearchPanel } from './components/SavedPlacesSearchPanel';
import { SavedPlacesSkeleton } from './components/SavedPlacesSkeleton';
import { SavedPlacesRecentShares } from './components/SavedPlacesRecentShares';
import {
  type SavedLibraryView,
  SavedPlacesViewToggle,
} from './components/SavedPlacesViewToggle';
import { SavedPostGrid } from './components/SavedPostGrid';
import {
  INITIAL_BAR_SCROLL_STATE,
  reduceBarScroll,
  SavedPlacesStickyBar,
} from './components/SavedPlacesStickyBar';
import { LIBRARY_GUTTER } from './components/libraryTheme';
import {
  getReelProcessingStatus,
  normalizeInstagramContentUrl,
  saveContent,
} from '../../entities/content/api';
import { subscribeRecentShares } from '../../entities/content/recent-shares-poller';
import type {
  HistoryReel,
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
  // 게시물 편집은 장소 편집(하단 삭제 막대·장소 삭제)과 따로 둡니다. 삭제 동작은 아직 없습니다.
  const [isEditingPosts, setIsEditingPosts] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sharedReels, setSharedReels] = useState<HistoryReel[]>([]);
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
  const barReveal = useRef(new Animated.Value(1)).current;
  const barScrollStateRef = useRef(INITIAL_BAR_SCROLL_STATE);
  const barRevealTargetRef = useRef(1);
  // 화면이 사라진 뒤에 바 숨김/표시 애니메이션이 남아 돌지 않게 멈춥니다.
  useEffect(() => () => barReveal.stopAnimation(), [barReveal]);
  const hasCapturedViewRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const reelPollStartedAtRef = useRef<number | null>(null);
  const reelPollFailureCountRef = useRef(0);
  const saveRequestIdRef = useRef<string | null>(null);
  const hasSavedPlaces = places.length > 0;
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const activeCategory = selectedCategory;
  const filteredPlaces = useMemo(
    () => filterPlacesByCategory(places, activeCategory),
    [places, activeCategory],
  );
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

  const refreshSavedPlaces = useCallback(async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    analytics.refreshed();

    try {
      await loadSavedPlaces();
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [analytics, loadSavedPlaces]);

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

    const refreshAfterExternalShare = async (requestId?: string) => {
      const firstRefreshSucceeded = await loadSavedPlaces();
      if (!firstRefreshSucceeded) {
        return;
      }

      // COMPLETED 직후 읽기에서 새 장소가 아직 보이지 않는 짧은 지연을
      // 흡수하기 위해 한 번 더 조회한 뒤 공유 결과를 소비합니다.
      await new Promise<void>(resolve => setTimeout(resolve, 700));
      const confirmed = await loadSavedPlaces();
      if (confirmed) {
        await onSharedResultConsumed?.(requestId);
      }
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
      if (state.status === 'COMPLETED') {
        if (state.source === 'instagram_share') {
          refreshAfterExternalShare(state.shareResultId).catch(() => undefined);
        }
        setSharedSaveState(null);
      }
    };

    applySharedState(getSharedSaveState());
    const unsubscribe = subscribeSharedSaveState(applySharedState);
    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [isGuest, loadSavedPlaces, onSharedResultConsumed]);

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
      setProcessingReel(null);
      setShowSaveSuccess(source === 'url_input');
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
    error,
  ]);

  useEffect(() => {
    if (isGuest) {
      setSharedReels([]);
      return;
    }
    // 최근 공유 행과 게시물 보기는 앱 공용 폴러가 읽은 공유 목록을 그대로 씁니다.
    // 첫 조회는 하단 탭 바가 시작하므로 여기서는 결과만 받고 따로 읽지 않습니다.
    const subscription = subscribeRecentShares({
      intervalMs: RECENT_SHARES_INTERVAL_MS,
      onResult: ({ reels }) => setSharedReels(reels),
    });
    return () => subscription.unsubscribe();
  }, [isGuest]);

  // 방금 저장을 요청한 릴스는 서버 목록에 잡히기 전에도 "최근 공유" 줄에 처리 중으로 바로 보여 줍니다.
  // 처리 중·대기 상태만 끼워 넣어서, 실패한 요청의 임시 카드가 목록에 남지 않게 합니다.
  const recentRowReels = useMemo(() => {
    if (
      !processingReel ||
      (processingReel.processing_status !== 'PENDING' &&
        processingReel.processing_status !== 'PROCESSING') ||
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

  const postReels = useMemo(
    () => sharedReels.filter(reel => reel.processing_status === 'COMPLETED'),
    [sharedReels],
  );

  useEffect(() => {
    if (!showSaveSuccess) {
      return;
    }

    // 저장 API의 즉시 완료 응답, 상태 폴링 완료, 공유 상태 복원 중 어느
    // 경로로 완료되더라도 최신 저장 장소를 보관함에 바로 반영합니다.
    loadSavedPlaces().catch(() => undefined);

    const timeoutId = setTimeout(() => setShowSaveSuccess(false), 1800);
    return () => clearTimeout(timeoutId);
  }, [loadSavedPlaces, showSaveSuccess]);

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
  }, [analytics, isEditingPosts]);

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

  // 방금 공유한 릴스: 성공·처리 중·대기 중인 공유는 상세 화면(처리 중이면 진행 화면)으로,
  // 실패한 공유는 다시 시도할 수 있는 히스토리로 보냅니다.
  const handleOpenRecentReel = useCallback(
    (reel: HistoryReel) => {
      if (reel.processing_status !== 'FAILED') {
        handleOpenReel(reel);
        return;
      }
      handleOpenHistory();
    },
    [handleOpenHistory, handleOpenReel],
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
      '선택한 장소를 삭제할까요?',
      `선택한 ${count}곳의 장소가 보관함에서 삭제됩니다.`,
      [
        {
          text: '취소',
          style: 'cancel',
          onPress: () => analytics.button('delete_confirm_cancel', {count}),
        },
        {
          text: '삭제',
          style: 'destructive',
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

  const closeNestedScreen = useCallback(() => {
    if (isSearchOpen) setIsSearchOpen(false);
    else if (isEditing) handlePressEdit();
    else if (isEditingPosts) handlePressEditPosts();
  }, [
    handlePressEdit,
    handlePressEditPosts,
    isEditing,
    isEditingPosts,
    isSearchOpen,
  ]);
  useEffect(() => {
    const canGoBack =
      isScreenActive && (isSearchOpen || isEditing || isEditingPosts);
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

  const renderListContent = () => (
    <View style={styles.container}>
      <View
        style={[styles.header, hasSavedPlaces && styles.headerOverlay]}
      >
        <SavedPlacesHeader
          onPressSearch={() => {
            analytics.button('open_search');
            setIsSearchOpen(true);
          }}
        />
      </View>
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
            {libraryView === 'places' ? (
              <>
                <SavedPlaceGrid
                  isEditing={isEditing}
                  places={filteredPlaces}
                  onLongPressPlace={enterEditMode}
                  onPressPlace={(place, position) =>
                    openPlaceDetail(place, 'saved_places_grid', position)
                  }
                  onTogglePlaceSelection={togglePlaceSelection}
                  selectedPlaceIds={selectedPlaceIds}
                />
                {filteredPlaces.length === 0 ? (
                  <Text style={styles.categoryEmptyText}>
                    {activeCategory} 카테고리에 저장한 장소가 없어요
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <SavedPostGrid
                  isEditing={isEditingPosts}
                  reels={postReels}
                  onPressReel={handleOpenReel}
                  onToggleReelSelection={togglePostSelection}
                  selectedReelIds={selectedPostIds}
                />
                {postReels.length === 0 ? (
                  <Text style={styles.categoryEmptyText}>
                    공유한 게시물이 아직 없어요
                  </Text>
                ) : null}
              </>
            )}
          </ScrollView>
          {libraryBarLayout !== null ? (
            <SavedPlacesStickyBar
              barHeight={libraryBarLayout.height}
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
      {isEditing ? (
        <Pressable
          accessibilityLabel={
            selectedPlaceIds.size > 0
              ? '선택한 장소 삭제하기'
              : '보관함 편집 취소'
          }
          accessibilityRole="button"
          disabled={isDeleting}
          onPress={
            selectedPlaceIds.size === 0
              ? handlePressEdit
              : confirmDeleteSelectedPlaces
          }
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
              {selectedPlaceIds.size > 0
                ? isDeleting
                  ? '삭제 중...'
                  : '삭제하기'
                : '취소'}
            </Text>
            {selectedPlaceIds.size > 0 ? (
              <View style={styles.deleteCountBadge}>
                <Text style={styles.deleteCountText}>
                  {selectedPlaceIds.size}
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
                      places={places}
                      recentSearches={recentSearches}
                      onCloseSearch={() => {
                        analytics.button('close_search');
                        setIsSearchOpen(false);
                      }}
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
