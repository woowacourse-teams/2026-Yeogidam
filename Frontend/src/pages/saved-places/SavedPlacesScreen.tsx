import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/auth/supabase';

import {
  BOTTOM_NAVIGATION_BAR_BOTTOM_GAP,
  BOTTOM_NAVIGATION_BAR_HEIGHT,
  bottomNavigationBarContainerStyle,
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
  getReelProcessingStatus,
  normalizeInstagramContentUrl,
  saveContent,
} from '../../entities/content/api';
import type {ReelProcessingStatus, SaveSource} from '../../entities/content/types';
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

// 실제 저장 상태 카드만 표시합니다. 정적 디자인 미리보기는 제거했습니다.
const SHOW_CARD_PREVIEW = false;
const REEL_POLL_TIMEOUT_MS = 90_000;
const REEL_POLL_FAILURE_LIMIT = 3;
const MAX_RECENT_SEARCHES = 10;

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

function ReelStatusCard({
  status,
  message,
  description,
  onCancel,
  onRetry,
}: {
  status: 'PROCESSING' | 'FAILED' | 'COMPLETED';
  message: string;
  description: string;
  onCancel?: () => void;
  onRetry?: () => void;
}) {
  const failed = status === 'FAILED';
  const completed = status === 'COMPLETED';
  const progress = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    if (failed || completed) {
      return;
    }

    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }),
    );
    animation.start();

    return () => animation.stop();
  }, [completed, failed, progress]);

  return (
    <View style={styles.processingCard}>
      <Text style={styles.processingTitle}>{message}</Text>
      <Text style={styles.processingMessage}>{description}</Text>
      {!failed && !completed ? (
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressIndicator,
              {
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [-1, 1],
                      outputRange: [-80, 180],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.processingActions}>
          {failed && onRetry ? (
            <Pressable onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onCancel} style={styles.dismissButton}>
            <Text style={styles.dismissButtonText}>
              {failed ? '닫기' : '취소'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function getFailureCode(reason: string | null): string | null {
  return reason?.split(' | ', 1)[0]?.trim() || null;
}

function getFailureMessage(reason: string | null): string {
  switch (getFailureCode(reason)) {
    case 'CLIENT000_001':
      return '인터넷 연결이 불안정해요.';
    case 'CLIENT000_002':
      return '응답이 늦어져 저장하지 못했어요.';
    case 'CLIENT000_003':
      return '저장 결과를 확인하지 못했어요.';
    case 'AUTH401_001':
      return '로그인 정보가 없어 릴스를 저장하지 못했어요.';
    case 'AUTH401_002':
      return '로그인이 만료되어 릴스를 저장하지 못했어요.';
    case 'AUTH403_001':
      return '릴스를 저장할 권한이 없어요.';
    case 'REEL400_001':
      return '지원하지 않는 링크예요.';
    case 'IG_CAPTION_NOT_FOUND':
      return '릴스 캡션을 읽지 못했어요.';
    case 'GEMINI_PLACE_NOT_FOUND':
      return '캡션에서 장소 후보를 찾지 못했어요.';
    case 'KAKAO_PLACE_NOT_FOUND':
      return '지도에서 일치하는 장소를 찾지 못했어요.';
    case 'PLACE_NOT_FOUND':
      return '장소를 찾지 못했어요.';
    case 'DATA500_001':
    case 'COMMON500_001':
      return '서버에서 저장 요청을 처리하지 못했어요.';
    default:
      return '릴스를 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
  }
}

function getFailureDescription(reason: string | null): string {
  switch (getFailureCode(reason)) {
    case 'CLIENT000_001':
      return '인터넷 연결을 확인한 뒤 다시 시도해주세요.';
    case 'CLIENT000_002':
      return '잠시 후 다시 시도해주세요.';
    case 'CLIENT000_003':
      return '보관함을 다시 열어 저장 결과를 확인해주세요.';
    case 'AUTH401_001':
    case 'AUTH401_002':
      return '여기담에 다시 로그인한 뒤 공유해주세요.';
    case 'AUTH403_001':
      return '현재 계정의 권한을 확인해주세요.';
    case 'REEL400_001':
      return 'Instagram 릴스 링크를 공유해주세요.';
    case 'KAKAO_PLACE_NOT_FOUND':
      return '릴스의 장소 정보와 주소를 확인해주세요.';
    case 'IG_CAPTION_NOT_FOUND':
      return '릴스에 장소 정보가 포함되어 있는지 확인해주세요.';
    case 'GEMINI_PLACE_NOT_FOUND':
      return '릴스 캡션에 장소명이 포함되어 있는지 확인해주세요.';
    case 'PLACE_NOT_FOUND':
      return '릴스에 장소 정보가 포함되어 있는지 확인해주세요.';
    case 'DATA500_001':
    case 'COMMON500_001':
      return '잠시 후 다시 시도해주세요.';
    default:
      return '잠시 후 다시 시도하거나 다른 릴스 링크를 사용해주세요.';
  }
}

function canRetryFailure(reason: string | null): boolean {
  return [
    'CLIENT000_001',
    'CLIENT000_002',
    'CLIENT000_003',
    'DATA500_001',
  ].includes(getFailureCode(reason) ?? '');
}

type SavedPlacesScreenProps = {
  onOpenDetail: (place: Place) => void;
  onAuthenticationRequired?: () => void;
  onEditModeChange?: (isEditing: boolean) => void;
  /** Allows previews/tests to provide a fixed list instead of calling the API. */
  onRequireLogin?: () => void;
  onOpenInbox?: () => void;
  places?: Place[];
  onSharedResultConsumed?: (requestId?: string) => Promise<void>;
  onSharedResultDismissed?: (requestId?: string) => Promise<void>;
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
  onAuthenticationRequired,
  onEditModeChange,
  onRequireLogin,
  onOpenInbox,
  places: providedPlaces,
  onSharedResultConsumed,
  onSharedResultDismissed,
}: SavedPlacesScreenProps) {
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
  const [places, setPlaces] = useState<Place[]>(providedPlaces ?? []);
  const [error, setError] = useState<SavedPlacesApiError | null>(null);
  const [isLoading, setIsLoading] = useState(providedPlaces === undefined);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<SavedPlacesApiError | null>(null);
  const [processingReelId, setProcessingReelId] = useState<string | null>(null);
  const [processingReel, setProcessingReel] =
    useState<ReelProcessingStatus | null>(null);
  const [processingUrl, setProcessingUrl] = useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [_statusQueryError, setStatusQueryError] = useState<ReelApiError | null>(
    null,
  );
  const [isSaveResponseFailure, setIsSaveResponseFailure] = useState(false);
  const [_shareApiDiagnostics, setShareApiDiagnostics] =
    useState<ShareApiDiagnostics | null>(null);
  const [_lastRequestId, setLastRequestId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const reelPollStartedAtRef = useRef<number | null>(null);
  const reelPollFailureCountRef = useRef(0);
  const hasSavedPlaces = places.length > 0;
  const isEditActionInScroll = hasSavedPlaces && !SHOW_CARD_PREVIEW;
  const bottomActionOffset =
    bottomInset > 0 ? BOTTOM_NAVIGATION_BAR_BOTTOM_GAP : 8;

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

  useEffect(() => {
    let isActive = true;
    const verifiedKeys = new Set<string>();
    const verificationInFlight = new Set<string>();

    const verifySharedReelBeforeShowing = async (
      state: NonNullable<ReturnType<typeof getSharedSaveState>>,
      verificationKey: string,
    ) => {
      verificationInFlight.add(verificationKey);
      setShareApiDiagnostics(current => current ? {
        ...current,
        statusQueryCount: current.statusQueryCount + 1,
        lastQueriedAt: new Date(),
        queryFailureReason: null,
      } : current);
      try {
        let currentStatus: ReelProcessingStatus | null;
        try {
          currentStatus = await getReelProcessingStatus(state.reel.id);
        } catch (error) {
          const normalized = normalizeReelError(error);
          if (normalized.errorCode !== 'AUTH401_002') throw normalized;

          const {error: refreshError} = await supabase.auth.refreshSession();
          if (refreshError) throw normalized;
          currentStatus = await getReelProcessingStatus(state.reel.id);
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
          setShareApiDiagnostics(current => current ? {
            ...current,
            queriedStatus: null,
            queryFailureReason: '조회 결과 없음',
          } : current);
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
        setShareApiDiagnostics(current => current ? {
          ...current,
          queriedStatus: currentStatus.processing_status,
          queryFailureReason: currentStatus.failure_reason,
        } : current);
        setSharedSaveState({
          ...state,
          status: currentStatus.processing_status,
          reel: currentStatus,
        });
      } catch (error) {
        const normalized = normalizeReelError(error);
        if (__DEV__) {
          console.warn('[InstagramShare][status-error]', {
            requestId: state.shareResultId ?? null,
            reelId: state.reel.id,
            errorCode: normalized.errorCode ?? null,
            message: normalized.message,
          });
        }
        setShareApiDiagnostics(current => current ? {
          ...current,
          queryFailureReason: normalized.errorCode ?? normalized.message,
        } : current);
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
        setProcessingUrl(null);
        setStatusQueryError(null);
        return;
      }

      const hasRealReelId = !state.reel.id.startsWith('share-');
      setShareApiDiagnostics(current =>
        current?.reelId === state.reel.id &&
        current.requestUrl === state.url
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
        setProcessingUrl(state.url);
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
        setProcessingUrl(null);
        setStatusQueryError(null);
        if (!verificationInFlight.has(verificationKey)) {
          void verifySharedReelBeforeShowing(state, verificationKey);
        }
        return;
      }

      setProcessingUrl(state.url);
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
          void refreshAfterExternalShare(state.shareResultId);
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
  }, [loadSavedPlaces, onSharedResultConsumed]);

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

  const handleSaveLink = async (isSessionRetry = false) => {
    if (isSubmitting) {
      return;
    }

    const normalizedUrl =
      normalizeInstagramContentUrl(linkValue) ?? linkValue.trim();
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
    setProcessingUrl(normalizedUrl);
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
      const response = await saveContent(linkValue, 'url_input');
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
        saveMode: response.saveMode,
        reel: nextReel,
      });
      handleSaveResponse(response, normalizedUrl, 'url_input');
      setIsDialogVisible(false);
      setLinkValue('');
      if (response.saveMode === 'REVIEW_QUEUE') {
        onOpenInbox?.();
      }
    } catch (error) {
      const normalizedError = normalizeReelError(error);
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

      if (normalizedError.errorCode === 'AUTH401_002' && !isSessionRetry) {
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError) {
          setIsSubmitting(false);
          await handleSaveLink(true);
          return;
        }
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
      setProcessingUrl(null);
      setShowSaveSuccess(source === 'url_input');
      return;
    }

    // REEL-01의 200 FAILED 결과는 reused 값과 관계없이 재시도 UI를 표시합니다.
    setIsSaveResponseFailure(response.status === 'FAILED');
    setProcessingReelId(response.reelId);
    setProcessingUrl(url);
    setProcessingReel({
      id: response.reelId,
      processing_status: response.status,
      failure_reason: response.failureReason ?? null,
      instagram_thumbnail_url: null,
      created_at: new Date().toISOString(),
    });
  };

  const dismissProcessingCard = async () => {
    const currentState = getSharedSaveState();
    const isExternalShare = currentState?.source === 'instagram_share';
    const requestId = currentState?.shareResultId;
    setSharedSaveState(null);
    setIsSaveResponseFailure(false);
    setProcessingReelId(null);
    setProcessingReel(null);
    setProcessingUrl(null);
    setStatusQueryError(null);
    if (isExternalShare) {
      try {
        await onSharedResultDismissed?.(requestId);
      } catch {
        // 카드는 즉시 닫되 다음 실행에서 삭제를 다시 시도할 수 있습니다.
      }
    }
  };

  const retryProcessing = async () => {
    if (!processingUrl || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const source = getSharedSaveState()?.source ?? 'url_input';
    const requestSource: SaveSource =
      source === 'instagram_share' ? 'url_input' : source;
    try {
      const response = await saveContent(processingUrl, requestSource);
      handleSaveResponse(response, processingUrl, source);
    } catch (error) {
      const normalized = normalizeReelError(error);
      if (normalized.errorCode === 'AUTH401_002') {
        const {error: refreshError} = await supabase.auth.refreshSession();
        if (!refreshError) {
          try {
            const response = await saveContent(processingUrl, requestSource);
            handleSaveResponse(response, processingUrl, source);
            return;
          } catch (retryError) {
            error = retryError;
          }
        } else {
          onRequireLogin?.();
          return;
        }
      }
      const finalError = normalizeReelError(error);
      setStatusQueryError(finalError);
      setIsSaveResponseFailure(true);
    } finally {
      setIsSubmitting(false);
    }
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
    const poll = async () => {
      if (Date.now() - (reelPollStartedAtRef.current ?? Date.now()) >= REEL_POLL_TIMEOUT_MS) {
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
        setShareApiDiagnostics(current => current ? {
          ...current,
          statusQueryCount: current.statusQueryCount + 1,
          lastQueriedAt: new Date(),
          queryFailureReason: null,
        } : current);
        let nextStatus: ReelProcessingStatus | null;
        try {
          nextStatus = await getReelProcessingStatus(processingReelId);
        } catch (error) {
          const firstError = normalizeReelError(error);
          if (firstError.errorCode !== 'AUTH401_002') {
            throw firstError;
          }

          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            throw firstError;
          }

          nextStatus = await getReelProcessingStatus(processingReelId);
        }

        if (isActive && !nextStatus) {
          if (__DEV__) {
            console.warn('[InstagramShare][status-response]', {
              reelId: processingReelId,
              result: null,
            });
          }
          setShareApiDiagnostics(current => current ? {
            ...current,
            queriedStatus: null,
            queryFailureReason: '조회 결과 없음',
          } : current);
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
          setShareApiDiagnostics(current => current ? {
            ...current,
            queriedStatus: nextStatus.processing_status,
            queryFailureReason: nextStatus.failure_reason,
          } : current);
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
      } catch (error) {
        if (isActive) {
          reelPollFailureCountRef.current += 1;
          const normalizedError = normalizeReelError(error);
          if (__DEV__) {
            console.warn('[InstagramShare][status-error]', {
              reelId: processingReelId,
              errorCode: normalizedError.errorCode ?? null,
              message: normalizedError.message,
              attempt: reelPollFailureCountRef.current,
            });
          }
          setShareApiDiagnostics(current => current ? {
            ...current,
            queryFailureReason:
              normalizedError.errorCode ?? normalizedError.message,
          } : current);
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

    const intervalId = setInterval(poll, 3000);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [
    onRequireLogin,
    processingReel?.created_at,
    processingReel?.id,
    processingReel?.processing_status,
    processingReelId,
  ]);

  useEffect(() => {
    if (!showSaveSuccess) {
      return;
    }

    // 저장 API의 즉시 완료 응답, 상태 폴링 완료, 공유 상태 복원 중 어느
    // 경로로 완료되더라도 최신 저장 장소를 보관함에 바로 반영합니다.
    void loadSavedPlaces();

    const timeoutId = setTimeout(() => setShowSaveSuccess(false), 1800);
    return () => clearTimeout(timeoutId);
  }, [loadSavedPlaces, showSaveSuccess]);

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

  return (
    <View style={styles.container}>
      {isSearchOpen ? (
        <>
          <SavedPlacesSearchPanel
            places={places}
            recentSearches={recentSearches}
            onCloseSearch={() => setIsSearchOpen(false)}
            onPressPlace={onOpenDetail}
            onSaveSearchTerm={saveRecentSearch}
          />
        </>
      ) : (
        <>
          <SavedPlacesHeader onPressSearch={() => setIsSearchOpen(true)} />
          {!isEditActionInScroll ? (
            <SavedPlacesEditAction
              isEditing={isEditing}
              onPress={handlePressEdit}
            />
          ) : null}
          {SHOW_CARD_PREVIEW ? (
            <ScrollView
              contentContainerStyle={styles.previewContent}
              showsVerticalScrollIndicator={false}
            >
              <ReelStatusCard
                status="PROCESSING"
                message="릴스에서 장소를 찾고 있어요."
                description="처리가 완료되면 보관함에 반영됩니다."
              />
              <ReelStatusCard
                status="FAILED"
                message="인터넷 연결을 확인해주세요."
                description="연결을 확인한 뒤 다시 시도해주세요."
                onCancel={() => {}}
                onRetry={() => {}}
              />
              <ReelStatusCard
                status="FAILED"
                message="데이터를 처리하지 못했어요."
                description="잠시 후 다시 시도해주세요."
                onCancel={() => {}}
                onRetry={() => {}}
              />
              <ReelStatusCard
                status="FAILED"
                message="지도에서 일치하는 장소를 찾지 못했어요."
                description="릴스의 장소 정보를 확인한 뒤 다시 시도해주세요."
                onCancel={() => {}}
              />
              <ReelStatusCard
                status="FAILED"
                message="릴스 캡션을 읽지 못했어요."
                description="릴스에 장소 정보가 포함되어 있는지 확인해주세요."
                onCancel={() => {}}
              />
              <ReelStatusCard
                status="COMPLETED"
                message="장소를 저장했어요."
                description="보관함에 반영되었습니다."
              />
            </ScrollView>
          ) : showSaveSuccess ? (
            <ReelStatusCard
              status="COMPLETED"
              message="장소를 저장했어요."
              description="보관함에 반영되었습니다."
            />
          ) : processingReel &&
            processingReel.processing_status === 'FAILED' ? (
            <ReelStatusCard
              status="FAILED"
              message={getFailureMessage(processingReel.failure_reason)}
              description={getFailureDescription(processingReel.failure_reason)}
              onCancel={dismissProcessingCard}
              // REEL-01이 200 FAILED를 반환한 경우
              // reused 값과 관계없이 동일 URL로 저장 요청을 다시 보냅니다.
              onRetry={
                isSaveResponseFailure && canRetryFailure(processingReel.failure_reason)
                  ? retryProcessing
                  : undefined
              }
            />
          ) : null}
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
                  onPressPlace={onOpenDetail}
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
              : handleDeleteSelectedPlaces
          }
          style={({pressed}) => [
            bottomNavigationBarContainerStyle,
            styles.deleteAction,
            {bottom: bottomActionOffset},
            isDeleting && styles.deleteActionDisabled,
            pressed && styles.deleteActionPressed,
          ]}>
          <View style={styles.deleteActionContent}>
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
            { bottom: BOTTOM_NAVIGATION_BAR_HEIGHT + bottomInset + 12 },
          ]}
        >
          <View style={styles.fab}>
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
  processingCard: {
    marginHorizontal: 24,
    marginTop: 10,
    marginBottom: 16,
    borderRadius: 20,
    backgroundColor: '#e9edff',
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'column',
    shadowColor: '#4b4e5d',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    elevation: 6,
  },
  previewContent: {
    paddingBottom: 32,
  },
  floatingStatus: {
    marginHorizontal: 24,
    marginTop: 12,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#e9edff',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#4b4e5d',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 12,
    elevation: 4,
  },
  floatingStatusText: {
    color: '#24243a',
    fontSize: 14,
    fontWeight: '700',
  },
  floatingStatusChevron: {
    color: '#7186ed',
    fontSize: 28,
    lineHeight: 28,
  },
  successCard: {
    backgroundColor: '#e9edff',
  },
  processingTextBlock: {
    flex: 0,
    minWidth: 0,
    width: '100%',
  },
  processingTitle: {
    color: '#24243a',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  processingMessage: {
    marginTop: 4,
    color: '#70758d',
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
  },
  progressTrack: {
    height: 4,
    marginTop: 12,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#dce2ff',
  },
  progressIndicator: {
    width: 80,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8fa2ff',
  },
  processingActions: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
  },
  retryButton: {
    minWidth: 70,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#8fa2ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  dismissButton: {
    minWidth: 64,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e5ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  dismissButtonText: {
    color: '#4f5d9b',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
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
