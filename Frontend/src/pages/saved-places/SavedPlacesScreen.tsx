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
import type { Place } from '../../entities/place/types';
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
import {subscribeRecentShares} from '../../entities/content/recent-shares-poller';
import type {HistoryReel, ReelProcessingStatus, SaveSource} from '../../entities/content/types';
import { normalizeReelError } from '../../entities/content/errors';
import {
  getSharedSaveState,
  setSharedSaveState,
  subscribeSharedSaveState,
} from '../../lib/reel-save-state';
import {useRecentSearches} from './hooks/useRecentSearches';
import {useSavedPlacesEditing} from './hooks/useSavedPlacesEditing';
import {useSavedPlacesList} from './hooks/useSavedPlacesList';

const REEL_POLL_INTERVAL_MS = 3000;
const REEL_POLL_TIMEOUT_MS = 90_000;
const REEL_POLL_FAILURE_LIMIT = 3;

type SavedPlacesScreenProps = {
  onOpenDetail: (place: Place, context?: SavedPlaceViewContext) => void;
  isGuest?: boolean;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  onAuthenticationRequired?: () => void;
  onEditModeChange?: (isEditing: boolean) => void;
  /** Allows previews/tests to provide a fixed list instead of calling the API. */
  onRequireLogin?: () => void;
  // onOpenInbox?: () => void;
  places?: Place[];
  /** 비회원 시드 장소는 API 대신 이 콜백으로 지웁니다. */
  onDeleteGuestPlaces?: (placeIds: string[]) => void;
  onSharedResultConsumed?: (requestId?: string) => Promise<void>;
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
  isGuest = false,
  initialScrollOffset = 0,
  onScrollOffsetChange,
  onAuthenticationRequired,
  onEditModeChange,
  onRequireLogin,
  // onOpenInbox,
  places: providedPlaces,
  onDeleteGuestPlaces,
  onSharedResultConsumed,
}: SavedPlacesScreenProps) {
  const posthog = usePostHog();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const {
    places,
    isLoading,
    error,
    isRefreshing,
    loadSavedPlaces,
    refreshSavedPlaces,
    removePlaces,
  } = useSavedPlacesList({providedPlaces, isGuest, onAuthenticationRequired});
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingReelId, setProcessingReelId] = useState<string | null>(null);
  const [processingReel, setProcessingReel] =
    useState<ReelProcessingStatus | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasCapturedViewRef = useRef(false);
  const reelPollStartedAtRef = useRef<number | null>(null);
  const reelPollFailureCountRef = useRef(0);
  const saveRequestIdRef = useRef<string | null>(null);
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

  const {
    isEditing,
    selectedPlaceIds,
    isDeleting,
    deleteError,
    toggleEditMode,
    enterEditMode,
    togglePlaceSelection,
    deleteSelectedPlaces,
  } = useSavedPlacesEditing({
    places,
    isGuest,
    removePlaces,
    loadSavedPlaces,
    onEditModeChange,
    onDeleteGuestPlaces,
    onAuthenticationRequired,
  });

  const {recentSearches, saveRecentSearch} = useRecentSearches();

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
        // 완료되어 소비했거나 새 공유 URL을 아직 찾지 못한 경우입니다.
        setProcessingReelId(null);
        setProcessingReel(null);
        return;
      }

      const hasRealReelId = !state.reel.id.startsWith('share-');
      if (
        (state.status === 'PENDING' || state.status === 'PROCESSING') &&
        !hasRealReelId
      ) {
        // Share Extension이 현재 requestId/URL로 API 응답을 기다리는 실제 상태입니다.
        // reelId가 오기 전에는 상태 API를 호출하지 않고 응답 대기 카드만 표시합니다.
        setProcessingReelId(null);
        setProcessingReel(state.reel);
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
      setShowSaveSuccess(
        state.status === 'COMPLETED' && state.source === 'url_input',
      );
      if (state.status === 'COMPLETED') {
        if (state.source === 'instagram_share') {
          refreshAfterExternalShare(state.shareResultId).catch(
            () => undefined,
          );
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
      onRequireLogin?.();
      return;
    }
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
      const response = await saveContent(linkValue, 'url_input', clientRequestId);
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
      handleSaveResponse(response, normalizedUrl, 'url_input');
      setIsDialogVisible(false);
      setLinkValue('');
      // v2 대기함 흐름 복원 시:
      // if (response.saveMode === 'REVIEW_QUEUE') onOpenInbox?.();
    } catch (submitError) {
      const normalizedError = normalizeReelError(submitError);
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
      setProcessingReelId(null);
      setProcessingReel(null);
      setShowSaveSuccess(source === 'url_input');
      return;
    }

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
      if (Date.now() - (reelPollStartedAtRef.current ?? Date.now()) >= REEL_POLL_TIMEOUT_MS) {
        if (isActive) {
          setProcessingReelId(null);
        }
        return;
      }
      try {
        let nextStatus: ReelProcessingStatus | null;
        try {
          // 서버에 단건 상태 조회 API가 없어 공유 목록 첫 페이지에서 찾습니다.
          const reel = (await recentReels).find(item => item.id === processingReelId);
          nextStatus = reel ? {
            id: reel.id,
            processing_status: reel.processing_status,
            failure_reason: reel.failure_reason,
            instagram_thumbnail_url: reel.instagram_thumbnail_url,
            created_at: reel.created_at,
          } : null;
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
          reelPollFailureCountRef.current += 1;
          if (reelPollFailureCountRef.current >= REEL_POLL_FAILURE_LIMIT) {
            setProcessingReelId(null);
          }
          return;
        }

        if (isActive && nextStatus) {
          reelPollFailureCountRef.current = 0;
          setProcessingReel(nextStatus);
          if (__DEV__) {
            console.info('[InstagramShare][status-response]', {
              reelId: nextStatus.id,
              status: nextStatus.processing_status,
              failureReason: nextStatus.failure_reason,
            });
          }
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
          }
        }
      }
    };

    // 히스토리 화면·배지와 같은 앱 공용 목록 폴러를 3초 주기로 구독합니다.
    const subscription = subscribeRecentShares({
      intervalMs: REEL_POLL_INTERVAL_MS,
      onResult: ({reels}) => {
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
    if (!showSaveSuccess) {
      return;
    }

    // 저장 API의 즉시 완료 응답, 상태 폴링 완료, 공유 상태 복원 중 어느
    // 경로로 완료되더라도 최신 저장 장소를 보관함에 바로 반영합니다.
    loadSavedPlaces().catch(() => undefined);

    const timeoutId = setTimeout(() => setShowSaveSuccess(false), 1800);
    return () => clearTimeout(timeoutId);
  }, [loadSavedPlaces, showSaveSuccess]);

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

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
            deleteSelectedPlaces().catch(() => undefined);
          },
        },
      ],
    );
  }, [deleteSelectedPlaces, isDeleting, selectedPlaceIds.size]);

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
                <Pressable onPress={deleteSelectedPlaces}>
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
                  onPress={toggleEditMode}
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
              ? toggleEditMode
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
