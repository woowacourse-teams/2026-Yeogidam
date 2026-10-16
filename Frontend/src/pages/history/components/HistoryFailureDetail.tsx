import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {usePostHog} from 'posthog-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {trackHistoryContentDetailViewed} from '../../../analytics/placeExtractionEvents';
import ReportIcon from '../../../assets/icons/actions/report.svg';
import RetryIcon from '../../../assets/icons/actions/retry.svg';
import InstagramIcon from '../../../assets/icons/social/instagram-color.svg';
import {
  BOTTOM_NAVIGATION_BAR_HEIGHT,
  getBottomNavigationBarOffset,
} from '../../../components/BottomNavigationBar';
import type {HistoryReel, HistoryReelDetail} from '../../../entities/content/types';
import {getHistoryFailureMessage} from '../history-format';
import {useHistoryReelDetail} from '../useHistoryReelDetail';
import {useHistoryReport} from '../useHistoryReport';
import {HISTORY_FALLBACK_THUMBNAIL, historyStyles} from './historyStyles';

/**
 * 장소 분석에 실패한 히스토리 항목의 상세입니다. 실패 이유를 보이고 다시 시도와 제보를 받습니다.
 * 두 동작 모두 확인 창을 거치고, 비회원이면 확인 창 대신 로그인을 요청합니다.
 */
export function HistoryFailureDetail({
  onBack,
  reel,
  onRetry,
  guestDetail,
  onRequireLogin,
}: {
  onBack: () => void;
  reel: HistoryReel;
  onRetry: () => Promise<void>;
  guestDetail?: HistoryReelDetail | null;
  onRequireLogin?: () => void;
}) {
  const posthog = usePostHog();
  const {bottom: bottomInset} = useSafeAreaInsets();
  const detailBottomPadding =
    BOTTOM_NAVIGATION_BAR_HEIGHT +
    getBottomNavigationBarOffset(bottomInset) +
    (Platform.OS === 'android' ? 48 : 24);
  const [containerHeight, setContainerHeight] = useState(0);
  const availableBodyHeight = Math.max(
    0,
    containerHeight - 84 - detailBottomPadding,
  );
  const compactScale =
    containerHeight === 0
      ? 1
      : Math.max(0.5, Math.min(1, (availableBodyHeight - 187) / 337));
  useEffect(() => {
    trackHistoryContentDetailViewed(posthog, reel.id, 'failed');
  }, [posthog, reel.id]);
  const {reported, report} = useHistoryReport(reel.id);
  const [retrying, setRetrying] = useState(false);
  const detailState = useHistoryReelDetail(reel, guestDetail);
  const displayReel = detailState.status === 'success' ? detailState.detail : reel;
  const originalUrl = displayReel.instagram_url;

  return (
    <View
      onLayout={event => setContainerHeight(event.nativeEvent.layout.height)}
      style={historyStyles.container}
    >
      <View style={historyStyles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="히스토리 목록으로 돌아가기"
          hitSlop={12}
          onPress={onBack}
          style={historyStyles.backButton}
        >
          <Text style={historyStyles.back}>‹</Text>
        </Pressable>
        <Text style={historyStyles.headerTitle}>히스토리</Text>
        <View style={historyStyles.headerSpacer} />
      </View>
      <View
        style={[
          styles.failureContent,
          {paddingBottom: detailBottomPadding},
        ]}
      >
        <View style={[styles.failureHero, {marginTop: 44 * compactScale}]}>
          {/* TODO(review): 목록 카드, 성공 상세와 달리 local_thumbnail_source를 보지 않습니다. 비회원 체험 항목이 지금은 성공 상태라 드러나지 않습니다. */}
          <Image
            source={{ uri: displayReel.instagram_thumbnail_url ?? HISTORY_FALLBACK_THUMBNAIL }}
            resizeMode="cover"
            style={[
              historyStyles.detailThumbnail,
              {
                width: 180 * compactScale,
                height: 226 * compactScale,
              },
            ]}
          />
          <Text
            style={[historyStyles.detailTitle, {marginTop: 24 * compactScale}]}
          >
            장소 분석에 실패했어요ㅠ
          </Text>
          <Text
            style={[styles.failureDescription, {marginTop: 6 * compactScale}]}
          >
            {getHistoryFailureMessage(displayReel.failure_reason)}
          </Text>
        </View>
        <Pressable
          disabled={!originalUrl}
          onPress={() => {
            if (originalUrl) {
              Linking.openURL(originalUrl).catch(() => undefined);
            }
          }}
          style={[
            historyStyles.originalButton,
            styles.failureOriginalButton,
            !originalUrl && historyStyles.disabledButton,
          ]}
        >
          <InstagramIcon width={28} height={27} />
          <Text style={historyStyles.originalText}>원본 릴스로 이동</Text>
          <Text style={historyStyles.detailChevron}>›</Text>
        </Pressable>
        <View style={styles.failureActions}>
          <Pressable
            disabled={!originalUrl || retrying}
            onPress={() => {
              if (guestDetail !== undefined) {
                onRequireLogin?.();
                return;
              }
              Alert.alert('다시 시도할까요?', '', [
                { text: '취소', style: 'cancel' },
                {
                  text: '확인',
                  onPress: () => {
                    // 접수 응답을 기다리는 동안 버튼에 로딩을 보여 준다.
                    setRetrying(true);
                    onRetry()
                      .catch(() => undefined)
                      .finally(() => setRetrying(false));
                  },
                },
              ]);
            }}
            style={[
              styles.actionButton,
              {marginTop: 24 * compactScale},
              retrying && historyStyles.disabledButton,
            ]}
          >
            {retrying ? (
              <ActivityIndicator color="#2a2a44" size="small" style={styles.actionIcon} />
            ) : (
              <RetryIcon width={20} height={20} style={styles.actionIcon} />
            )}
            <Text style={styles.actionText}>
              {retrying ? '다시 시도하는 중...' : '다시 시도하기'}
            </Text>
          </Pressable>
          <Pressable
            disabled={reported}
            onPress={() => {
              if (guestDetail !== undefined) {
                onRequireLogin?.();
                return;
              }
              Alert.alert('제보할까요?', '', [
                { text: '취소', style: 'cancel' },
                {
                  text: '확인',
                  onPress: () => {
                    report().then(sent => {
                      if (!sent) Alert.alert('제보하지 못했어요', '잠시 후 다시 시도해주세요.');
                    });
                  },
                },
              ]);
            }}
            style={[
              styles.actionButton,
              styles.reportActionButton,
              {marginTop: 13 * compactScale},
              reported && historyStyles.disabledButton,
            ]}
          >
            <ReportIcon width={20} height={20} style={styles.actionIcon} />
            <Text style={styles.actionText}>
              {reported ? '제보 완료' : '제보하기'}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={historyStyles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  failureContent: { flex: 1 },
  failureHero: { alignItems: 'center' },
  failureOriginalButton: { marginTop: 49 },
  failureActions: { marginTop: 'auto' },
  failureDescription: {
    fontSize: 14,
    lineHeight: 22.4,
    color: '#8e8e93',
    textAlign: 'center',
    marginTop: 6,
  },
  actionButton: {
    height: 40,
    marginHorizontal: 22,
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.16)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportActionButton: { marginTop: 13 },
  actionIcon: { position: 'absolute', left: 32 },
  actionText: { fontSize: 15, fontWeight: '600', color: '#000' },
});
