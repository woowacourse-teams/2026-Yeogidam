import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
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

import { BOTTOM_TAB_BAR_HEIGHT } from '../../components/BottomTabBar';
import { toSavedPlaceDisplayPlace } from '../../entities/place/api';
import type { Place } from '../../entities/place/types';
import { getSavedPlaces } from '../../entities/info/api';
import type { SavedPlacesApiError } from '../../entities/info/types';
import { SavedPlacesErrorState } from './components/SavedPlacesErrorState';
import { SavedPlacesEmptyState } from './components/SavedPlacesEmptyState';
import { SavedPlaceGrid } from './components/SavedPlaceGrid';
import { SavedPlacesHeader } from './components/SavedPlacesHeader';
import { SavedPlacesLinkDialog } from './components/SavedPlacesLinkDialog';
import { SavedPlacesSearchPanel } from './components/SavedPlacesSearchPanel';
import { SavedPlacesSkeleton } from './components/SavedPlacesSkeleton';
import {
  getLatestProcessingReel,
  getReelProcessingStatus,
  saveContent,
} from '../../entities/content/api';
import type { ReelProcessingStatus } from '../../entities/content/types';
import {
  normalizeReelError,
  ReelApiError,
} from '../../entities/content/errors';
import {
  getSharedSaveState,
  setSharedSaveState,
  subscribeSharedSaveState,
} from '../../lib/reel-save-state';

// 실제 저장 상태 카드만 표시합니다. 정적 디자인 미리보기는 제거했습니다.
const SHOW_CARD_PREVIEW = false;

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

function getFailureMessage(reason: string | null): string {
  switch (reason) {
    case 'CLIENT000_001':
      return '인터넷 연결이 불안정해요.';
    case 'CLIENT000_002':
      return '응답이 늦어져 저장하지 못했어요.';
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
    default:
      return '릴스를 저장하지 못했어요. 잠시 후 다시 시도해주세요.';
  }
}

function getFailureDescription(reason: string | null): string {
  switch (reason) {
    case 'CLIENT000_001':
      return '인터넷 연결을 확인한 뒤 다시 시도해주세요.';
    case 'CLIENT000_002':
      return '잠시 후 다시 시도해주세요.';
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
  ].includes(reason ?? '');
}

function getStatusQueryMessage(error: ReelApiError): string {
  if (error.errorCode === 'CLIENT000_001') {
    return '인터넷 연결을 확인해주세요.';
  }
  if (error.errorCode === 'CLIENT000_002') {
    return '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.';
  }
  return error.message;
}

type SavedPlacesScreenProps = {
  onOpenDetail: (place: Place) => void;
  onAuthenticationRequired?: () => void;
  /** Allows previews/tests to provide a fixed list instead of calling the API. */
  onRequireLogin?: () => void;
  places?: Place[];
  sharedUrl?: string | null;
  onSharedUrlHandled?: () => void;
};

export function SavedPlacesScreen({
  onOpenDetail,
  onAuthenticationRequired,
  onRequireLogin,
  places: providedPlaces,
  sharedUrl = null,
  onSharedUrlHandled,
}: SavedPlacesScreenProps) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [places, setPlaces] = useState<Place[]>(providedPlaces ?? []);
  const [error, setError] = useState<SavedPlacesApiError | null>(null);
  const [isLoading, setIsLoading] = useState(providedPlaces === undefined);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingReelId, setProcessingReelId] = useState<string | null>(null);
  const [processingReel, setProcessingReel] =
    useState<ReelProcessingStatus | null>(null);
  const [processingUrl, setProcessingUrl] = useState<string | null>(null);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [statusQueryError, setStatusQueryError] = useState<ReelApiError | null>(
    null,
  );
  const [isSaveResponseFailure, setIsSaveResponseFailure] = useState(false);
  const [_lastRequestId, setLastRequestId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const hasSavedPlaces = places.length > 0;

  const loadSavedPlaces = useCallback(async () => {
    if (providedPlaces !== undefined) {
      setPlaces(providedPlaces);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const savedPlaces = await getSavedPlaces();
      setPlaces(savedPlaces.map(toSavedPlaceDisplayPlace));
    } catch (nextError) {
      const apiError = nextError as SavedPlacesApiError;
      setError(apiError);
      if (apiError.errorCode === 'AUTH401_001') {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsLoading(false);
    }
  }, [onAuthenticationRequired, providedPlaces]);

  useEffect(() => {
    loadSavedPlaces();
  }, [loadSavedPlaces]);

  useEffect(() => {
    const applySharedState = (state: ReturnType<typeof getSharedSaveState>) => {
      if (!state) {
        return;
      }

      setProcessingUrl(state.url);
      setProcessingReelId(
        state.status === 'PROCESSING' || state.status === 'PENDING'
          ? state.reel.id
          : null,
      );
      setProcessingReel(state.reel);
      setIsSaveResponseFailure(state.status === 'FAILED');
      setShowSaveSuccess(state.status === 'COMPLETED');
      if (state.status === 'COMPLETED') {
        // 완료 안내는 한 번만 보여주고 전역 복원 대상에서는 제거합니다.
        setSharedSaveState(null);
      }
    };

    applySharedState(getSharedSaveState());
    return subscribeSharedSaveState(applySharedState);
  }, []);

  useEffect(() => {
    if (providedPlaces !== undefined) {
      return;
    }

    getLatestProcessingReel()
      .then(reel => {
        if (reel) {
          setProcessingReelId(reel.id);
          setProcessingReel(reel);
        }
      })
      .catch(() => undefined);
  }, [providedPlaces]);

  useEffect(() => {
    if (!sharedUrl) {
      return;
    }

    let active = true;
    // 요청 응답을 기다리는 동안에도 즉시 처리중 카드를 보여줍니다.
    setProcessingReelId(null);
    setProcessingUrl(sharedUrl);
    const initialReel: ReelProcessingStatus = {
      id: `share-${Date.now()}`,
      processing_status: 'PROCESSING',
      failure_reason: null,
      instagram_thumbnail_url: null,
      created_at: new Date().toISOString(),
    };
    setProcessingReel(initialReel);
    setSharedSaveState({url: sharedUrl, status: 'PROCESSING', reel: initialReel});
    setShowSaveSuccess(false);
    setIsSaveResponseFailure(false);
    setIsSubmitting(true);
    setStatusQueryError(null);
    saveContent(sharedUrl, 'instagram_share')
      .then(response => {
        const nextReel: ReelProcessingStatus = {
          id: response.reelId,
          processing_status: response.status,
          failure_reason: response.failureReason ?? null,
          instagram_thumbnail_url: null,
          created_at: new Date().toISOString(),
        };
        setSharedSaveState({url: sharedUrl, status: response.status, reel: nextReel});
        if (active) {
          handleSaveResponse(response, sharedUrl);
        }
      })
      .catch(error => {
        const normalizedError = normalizeReelError(error);
        const failedReel: ReelProcessingStatus = {
          id: `share-failed-${Date.now()}`,
          processing_status: 'FAILED',
          failure_reason: normalizedError.errorCode,
          instagram_thumbnail_url: null,
          created_at: new Date().toISOString(),
        };
        setSharedSaveState({url: sharedUrl, status: 'FAILED', reel: failedReel});
        if (active) {
          setProcessingReelId(null);
          setProcessingReel(failedReel);
          setIsSaveResponseFailure(true);
        }
      })
      .finally(() => {
        if (active) {
          setIsSubmitting(false);
          onSharedUrlHandled?.();
        }
      });

    return () => {
      active = false;
    };
  }, [onSharedUrlHandled, sharedUrl]);

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

    const normalizedUrl = linkValue.trim();
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
        reel: nextReel,
      });
      handleSaveResponse(response, normalizedUrl);
      setIsDialogVisible(false);
      setLinkValue('');
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
  ) => {
    if (response.status === 'COMPLETED') {
      setIsSaveResponseFailure(false);
      setProcessingReelId(null);
      setProcessingReel(null);
      setProcessingUrl(null);
      setShowSaveSuccess(true);
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

  const dismissProcessingCard = () => {
    setSharedSaveState(null);
    setIsSaveResponseFailure(false);
    setProcessingReelId(null);
    setProcessingReel(null);
    setProcessingUrl(null);
    setStatusQueryError(null);
  };

  const retryProcessing = async () => {
    if (!processingUrl || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await saveContent(processingUrl, 'url_input');
      handleSaveResponse(response, processingUrl);
    } catch (error) {
      Alert.alert(
        '다시 시도할 수 없어요',
        error instanceof Error ? error.message : '잠시 후 다시 시도해주세요.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!processingReelId || processingReel?.processing_status === 'FAILED') {
      return;
    }

    let isActive = true;
    const poll = async () => {
      try {
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

        if (isActive && nextStatus) {
          setStatusQueryError(null);
          setProcessingReel(nextStatus);
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
            setShowSaveSuccess(true);
          }
        }
      } catch (error) {
        if (isActive) {
          const normalizedError = normalizeReelError(error);
          setStatusQueryError(normalizedError);
          if (normalizedError.errorCode === 'AUTH401_001') {
            setProcessingReelId(null);
            onRequireLogin?.();
          } else if (normalizedError.errorCode === 'AUTH403_001') {
            setProcessingReelId(null);
          } else if (!normalizedError.retryable) {
            setProcessingReelId(null);
          }
        }
      }
    };

    const intervalId = setInterval(poll, 3000);
    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [processingReelId, processingReel?.processing_status, onRequireLogin]);

  useEffect(() => {
    if (!showSaveSuccess) {
      return;
    }

    const timeoutId = setTimeout(() => setShowSaveSuccess(false), 1800);
    return () => clearTimeout(timeoutId);
  }, [showSaveSuccess]);

  const scrollToTop = () => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <View style={styles.container}>
      {isSearchOpen ? (
        <>
          <SavedPlacesSearchPanel
            places={places}
            onCloseSearch={() => setIsSearchOpen(false)}
            onPressPlace={onOpenDetail}
          />
        </>
      ) : (
        <>
          <SavedPlacesHeader onPressSearch={() => setIsSearchOpen(true)} />
          {SHOW_CARD_PREVIEW ? (
            <ScrollView
              contentContainerStyle={styles.previewContent}
              showsVerticalScrollIndicator={false}
            >
              <ReelStatusCard
                status="PROCESSING"
                message="릴스에서 장소를 찾고 있어요."
                description="처리가 완료되면 저장 장소에 반영됩니다."
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
                description="저장 장소에 반영되었습니다."
              />
            </ScrollView>
          ) : showSaveSuccess ? (
            <ReelStatusCard
              status="COMPLETED"
              message="장소를 저장했어요."
              description="저장 장소에 반영되었습니다."
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
          ) : processingReel &&
            processingReel.processing_status !== 'COMPLETED' ? (
            <ReelStatusCard
              status={statusQueryError ? 'FAILED' : 'PROCESSING'}
              message={
                statusQueryError
                  ? getStatusQueryMessage(statusQueryError)
                  : '릴스에서 장소를 찾고 있어요.'
              }
              description={
                statusQueryError
                  ? '잠시 후 다시 시도하거나 카드를 닫아주세요.'
                  : '처리가 완료되면 저장 장소에 반영됩니다.'
              }
              onCancel={dismissProcessingCard}
              onRetry={
                statusQueryError?.retryable
                  ? () => setStatusQueryError(null)
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
          {isLoading && !hasSavedPlaces ? (
            <SavedPlacesSkeleton />
          ) : hasSavedPlaces ? (
            <>
              <ScrollView
                ref={scrollViewRef}
                showsVerticalScrollIndicator={false}
              >
                <SavedPlaceGrid places={places} onPressPlace={onOpenDetail} />
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
      <Pressable
        accessibilityLabel="장소 링크 추가"
        accessibilityRole="button"
        onPress={openDialog}
        style={[
          styles.fabShadow,
          { bottom: BOTTOM_TAB_BAR_HEIGHT + bottomInset + 12 },
        ]}
      >
        <View style={styles.fab}>
          <Text style={styles.fabText}>＋</Text>
        </View>
      </Pressable>
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
