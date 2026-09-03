import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import RetryIcon from '../../assets/icons/actions/retry.svg';
import ReportIcon from '../../assets/icons/actions/report.svg';
import InstagramIcon from '../../assets/icons/social/instagram-color.svg';
import {
  getHistoryReelDetail,
  getHistoryReels,
  reportHistoryReel,
  saveContent,
} from '../../entities/content/api';
import type {
  HistoryCursor,
  HistoryPlace,
  HistoryReel,
  HistoryReelDetail,
} from '../../entities/content/types';
import {normalizeReelTitle} from '../../entities/content/title';

type HistoryScreenProps = { onBack: () => void };

const thumbnail =
  'https://www.figma.com/api/mcp/asset/88501ab5-fdd5-49c7-bda1-e486a502a36c.png';

const emptyCharacter =
  'https://www.figma.com/api/mcp/asset/446736dd-95ce-4bd1-8e39-fa004e2c8b29.png';
const detailCharacter =
  'https://www.figma.com/api/mcp/asset/7be73af3-e4e8-417a-9664-9dbe530b90f2.png';
const failureCharacter =
  'https://www.figma.com/api/mcp/asset/b1cdc2ef-0cfa-47ed-b534-cbe706d9bb97.png';
const placeThumbnail =
  'https://www.figma.com/api/mcp/asset/9313bcb8-b3f7-43b7-847e-e794cf94e2d9.png';
function getHistoryTitle(reel: HistoryReel) {
  return normalizeReelTitle(reel.instagram_description, reel.instagram_title);
}

function getFailureCode(reason: string | null) {
  return reason?.split(' | ', 1)[0]?.trim() || null;
}

function getHistoryFailureMessage(reason: string | null) {
  switch (getFailureCode(reason)) {
    case 'CLIENT000_001':
      return '인터넷 연결이 불안정해요.';
    case 'CLIENT000_002':
      return '응답이 늦어져 분석하지 못했어요.';
    case 'AUTH401_001':
      return '로그인이 필요해요.';
    case 'AUTH401_002':
      return '로그인이 만료됐어요.';
    case 'AUTH403_001':
      return '분석할 권한이 없어요.';
    case 'IG_CAPTION_NOT_FOUND':
      return '릴스 내용을 읽지 못했어요.';
    case 'GEMINI_PLACE_NOT_FOUND':
      return '캡션에서 장소를 찾지 못했어요.';
    case 'KAKAO_PLACE_NOT_FOUND':
      return '지도에서 일치하는 장소를 찾지 못했어요.';
    case 'PLACE_NOT_FOUND':
      return '장소를 찾지 못했어요.';
    case 'DATA500_001':
    case 'COMMON500_001':
      return '서버에서 분석을 처리하지 못했어요.';
    default:
      return '장소 분석에 실패했어요. 잠시 후 다시 시도해주세요.';
  }
}

function HistoryItem({
  reel,
  onPress,
}: {
  reel: HistoryReel;
  onPress?: () => void;
}) {
  const completed = reel.processing_status === 'COMPLETED';
  const processing =
    reel.processing_status === 'PENDING' ||
    reel.processing_status === 'PROCESSING';
  const label = completed ? '성공' : processing ? '처리중' : '실패';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.item}>
      <Image
        source={{ uri: reel.instagram_thumbnail_url ?? thumbnail }}
        resizeMode="cover"
        style={styles.thumbnail}
      />
      <View style={styles.itemText}>
        <View
          style={[
            styles.badge,
            completed
              ? styles.successBadge
              : processing
              ? styles.processingBadge
              : styles.failureBadge,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              completed
                ? styles.successText
                : processing
                ? styles.processingText
                : styles.failureText,
            ]}
          >
            {label}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.title}>
          {getHistoryTitle(reel)}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function formatHistoryDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function useHistoryReelDetail(reelId: string) {
  const [detail, setDetail] = useState<HistoryReelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    getHistoryReelDetail(reelId)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [reelId]);

  return { detail, loading, error };
}

function HistorySuccessDetail({
  onBack,
  reel,
}: {
  onBack: () => void;
  reel: HistoryReel;
}) {
  const { detail, loading, error } = useHistoryReelDetail(reel.id);
  const displayReel = detail ?? reel;
  const places =
    detail?.reel_places
      .map(item => item.place)
      .filter((place): place is HistoryPlace => Boolean(place)) ?? [];
  const originalUrl = displayReel.instagram_url;
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대기함으로 돌아가기"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.detailContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailHero}>
          <Image
            source={{ uri: detailCharacter }}
            style={styles.detailCharacter}
          />
          <Text style={styles.detailTitle}>장소 분석이 완료되었어요!</Text>
          <Text style={styles.detailSubtitle}>
            {loading
              ? '장소를 확인하고 있어요.'
              : `총 ${places.length}개의 장소를 찾았어요`}
          </Text>
        </View>
        <Pressable
          disabled={!originalUrl}
          onPress={() => {
            if (originalUrl) {
              void Linking.openURL(originalUrl);
            }
          }}
          style={[styles.originalButton, !originalUrl && styles.disabledButton]}
        >
          <InstagramIcon width={28} height={27} />
          <Text style={styles.originalText}>원본 릴스로 이동</Text>
          <Text style={styles.detailChevron}>›</Text>
        </Pressable>
        <Text style={styles.foundTitle}>발견한 장소</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.placeRow}
        >
          {loading ? (
            <Text style={styles.placeState}>장소를 불러오는 중이에요.</Text>
          ) : error ? (
            <Text style={styles.placeState}>장소를 불러오지 못했어요.</Text>
          ) : places.length === 0 ? (
            <Text style={styles.placeState}>발견한 장소가 없어요.</Text>
          ) : (
            places.map(place => (
              <View key={place.id} style={styles.placeCard}>
                <Image
                  source={{ uri: place.thumbnail_url ?? placeThumbnail }}
                  style={styles.placeImage}
                />
                <Text numberOfLines={1} style={styles.placeName}>
                  {place.name}
                </Text>
                <Text numberOfLines={1} style={styles.placeAddress}>
                  {place.road_address ?? place.address ?? ''}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

function HistoryFailureDetail({
  onBack,
  reel,
  onRetry,
}: {
  onBack: () => void;
  reel: HistoryReel;
  onRetry: () => Promise<void>;
}) {
  const [reported, setReported] = useState(false);
  const { detail } = useHistoryReelDetail(reel.id);
  const displayReel = detail ?? reel;
  const originalUrl = displayReel.instagram_url;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="히스토리 목록으로 돌아가기"
          hitSlop={12}
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.failureContent}>
        <View style={styles.failureHero}>
          <Image
            source={{ uri: failureCharacter }}
            style={styles.detailCharacter}
          />
          <Text style={styles.detailTitle}>장소 분석에 실패했어요ㅠ</Text>
          <Text style={styles.failureDescription}>
            {getHistoryFailureMessage(displayReel.failure_reason)}
          </Text>
        </View>
        <Pressable
          disabled={!originalUrl}
          onPress={() => {
            if (originalUrl) {
              void Linking.openURL(originalUrl);
            }
          }}
          style={[styles.originalButton, !originalUrl && styles.disabledButton]}
        >
          <InstagramIcon width={28} height={27} />
          <Text style={styles.originalText}>원본 릴스로 이동</Text>
          <Text style={styles.detailChevron}>›</Text>
        </Pressable>
        <Pressable
          disabled={!originalUrl}
          onPress={() => {
            Alert.alert('다시 시도할까요?', '', [
              { text: '취소', style: 'cancel' },
              {
                text: '확인',
                onPress: () => {
                  void onRetry().catch(() => undefined);
                },
              },
            ]);
          }}
          style={styles.actionButton}
        >
          <RetryIcon width={20} height={20} style={styles.actionIcon} />
          <Text style={styles.actionText}>다시 시도하기</Text>
        </Pressable>
        <Pressable
          disabled={reported}
          onPress={() =>
            Alert.alert('제보할까요?', '', [
              { text: '취소', style: 'cancel' },
              {
                text: '확인',
                onPress: () => {
                  setReported(true);
                  reportHistoryReel(reel.id)
                    .catch(() => {
                      setReported(false);
                      Alert.alert('제보하지 못했어요', '잠시 후 다시 시도해주세요.');
                    });
                },
              },
            ])
          }
          style={[
            styles.actionButton,
            styles.reportActionButton,
            reported && styles.disabledButton,
          ]}
        >
          <ReportIcon width={20} height={20} style={styles.actionIcon} />
          <Text style={styles.actionText}>
            {reported ? '제보 완료' : '제보하기'}
          </Text>
        </Pressable>
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

export function HistoryScreen({ onBack }: HistoryScreenProps) {
  const [reels, setReels] = useState<HistoryReel[]>([]);
  const [cursor, setCursor] = useState<HistoryCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [selectedSuccess, setSelectedSuccess] = useState(false);
  const [selectedFailure, setSelectedFailure] = useState(false);
  const [selectedReel, setSelectedReel] = useState<HistoryReel | null>(null);

  const retryHistoryReel = useCallback(async (reel: HistoryReel) => {
    if (!reel.instagram_url) {
      return;
    }

    setReels(current =>
      current.map(item =>
        item.id === reel.id
          ? { ...item, processing_status: 'PENDING', failure_reason: null }
          : item,
      ),
    );
    setSelectedFailure(false);
    setSelectedReel(null);

    try {
      const response = await saveContent(reel.instagram_url, 'url_input');
      setReels(current =>
        current.map(item =>
          item.id === reel.id
            ? {
                ...item,
                processing_status: response.status,
                failure_reason: response.failureReason ?? null,
              }
            : item,
        ),
      );
    } catch {
      Alert.alert('다시 시도하지 못했어요', '잠시 후 다시 시도해주세요.');
    }
  }, []);
  const load = useCallback(async (nextCursor?: HistoryCursor | null, silent = false) => {
    setError(false);
    if (nextCursor) setLoadingMore(true);
    else if (!silent) setLoading(true);
    try {
      const result = await getHistoryReels(nextCursor ?? undefined);
      setReels(current =>
        nextCursor ? [...current, ...result.reels] : result.reels,
      );
      setCursor(result.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = setInterval(() => {
      void load(undefined, true);
    }, 5000);

    return () => clearInterval(refresh);
  }, [load]);

  useEffect(() => {
    if (
      !reels.some(
        reel =>
          reel.processing_status === 'PENDING' ||
          reel.processing_status === 'PROCESSING',
      )
    ) {
      return;
    }

    const poll = setInterval(() => {
      reels
        .filter(
          reel =>
            reel.processing_status === 'PENDING' ||
            reel.processing_status === 'PROCESSING',
        )
        .forEach(reel => {
          getHistoryReelDetail(reel.id)
            .then(detail => {
              if (!detail) return;
              setReels(current =>
                current.map(item =>
                  item.id === detail.id
                    ? {
                        ...item,
                        ...detail,
                      }
                    : item,
                ),
              );
            })
            .catch(() => undefined);
        });
    }, 3000);

    return () => clearInterval(poll);
  }, [reels]);

  const groupedReels = reels.reduce<Record<string, HistoryReel[]>>(
    (groups, reel) => {
      const date = formatHistoryDate(reel.created_at);
      groups[date] = groups[date] ? [...groups[date], reel] : [reel];
      return groups;
    },
    {},
  );

  if (selectedSuccess) {
    return (
      <HistorySuccessDetail
        onBack={() => {
          setSelectedSuccess(false);
          setSelectedReel(null);
        }}
        reel={selectedReel as HistoryReel}
      />
    );
  }
  if (selectedFailure) {
    return (
      <HistoryFailureDetail
        onBack={() => {
          setSelectedFailure(false);
          setSelectedReel(null);
        }}
        reel={selectedReel as HistoryReel}
        onRetry={() => retryHistoryReel(selectedReel as HistoryReel)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={onBack} style={styles.backButton}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>히스토리</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          !loading && reels.length === 0 && styles.emptyContent,
        ]}
        onScroll={({nativeEvent}) => {
          const reachedBottom =
            nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >=
            nativeEvent.contentSize.height - 80;
          if (reachedBottom && cursor && !loadingMore) {
            void load(cursor);
          }
        }}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <Text style={styles.stateText}>히스토리를 불러오는 중이에요.</Text>
        ) : error ? (
          <View style={styles.stateBody}>
            <Text style={styles.stateText}>히스토리를 불러오지 못했어요.</Text>
            <Pressable onPress={() => load()} style={styles.retryButton}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        ) : reels.length === 0 ? (
          <View style={styles.emptyBody}>
            <Image
              source={{ uri: emptyCharacter }}
              style={styles.emptyCharacter}
            />
            <View style={styles.emptyText}>
              <Text style={styles.emptyTitle}>아직 공유된 콘텐츠가 없어요</Text>
              <Text style={styles.emptyDescription}>
                인스타그램 릴스나 유튜브 쇼츠에서{'\n'}공유하기를 통해 여기담에
                저장해보세요.
              </Text>
            </View>
          </View>
        ) : (
          Object.entries(groupedReels).map(([date, dateReels]) => (
            <View key={date} style={styles.group}>
              <Text style={styles.date}>{date}</Text>
              {dateReels.map(reel => (
                <HistoryItem
                  key={reel.id}
                  reel={reel}
                  onPress={
                    reel.processing_status === 'COMPLETED'
                      ? () => {
                          setSelectedReel(reel);
                          setSelectedSuccess(true);
                        }
                      : reel.processing_status === 'FAILED'
                      ? () => {
                          setSelectedReel(reel);
                          setSelectedFailure(true);
                        }
                      : undefined
                  }
                />
              ))}
            </View>
          ))
        )}
        {loadingMore ? <Text style={styles.moreLoadingText}>이전 기록을 불러오는 중이에요.</Text> : null}
      </ScrollView>
      <View style={styles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    height: 84,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    fontSize: 30,
    lineHeight: 34,
    color: 'rgba(0,0,0,.61)',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a2e',
    marginLeft: 17,
  },
  headerSpacer: { flex: 1 },
  previewToggle: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#f3f4fb',
  },
  previewToggleText: { fontSize: 12, fontWeight: '700', color: '#5c6fc8' },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  emptyContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    paddingBottom: 72,
    paddingHorizontal: 24,
  },
  emptyBody: { alignItems: 'center' },
  emptyCharacter: {
    width: 195,
    height: 195,
    borderRadius: 30,
    marginBottom: 24,
  },
  emptyText: { alignItems: 'center' },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 22.4,
    color: '#8e8e93',
    textAlign: 'center',
    marginTop: 8,
  },
  detailContent: { paddingBottom: 60 },
  detailHero: { alignItems: 'center', marginTop: 48 },
  detailCharacter: { width: 195, height: 195, borderRadius: 20 },
  detailTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a2e',
    marginTop: 24,
  },
  detailSubtitle: { fontSize: 14, color: '#8e8e93', marginTop: 8 },
  originalButton: {
    height: 61,
    marginHorizontal: 22,
    marginTop: 49,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.14)',
    borderRadius: 20,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 50,
  },
  disabledButton: { opacity: 0.45 },
  instagramIcon: { width: 28, height: 27 },
  originalText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    textAlign: 'center',
  },
  detailChevron: { fontSize: 30, color: '#000' },
  foundTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 35,
    marginLeft: 32,
  },
  placeRow: { paddingLeft: 31, paddingTop: 12, gap: 6 },
  placeCard: { width: 98 },
  placeImage: { width: 98, height: 98, borderRadius: 2 },
  placeName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1a1a2e',
    marginTop: 2,
  },
  placeAddress: { fontSize: 9, color: '#8e8e93', marginTop: 3 },
  placeState: { fontSize: 13, color: '#8e8e93', paddingTop: 24 },
  failureContent: { paddingBottom: 60 },
  failureHero: { alignItems: 'center', marginTop: 44 },
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
    marginTop: 70,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,.16)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportActionButton: { marginTop: 13 },
  actionIcon: { position: 'absolute', left: 32 },
  actionText: { fontSize: 15, fontWeight: '600', color: '#000' },
  group: { marginBottom: 16 },
  stateBody: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 180,
  },
  stateText: { fontSize: 15, color: '#8e8e93', textAlign: 'center' },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: '#dbe0f9',
  },
  retryText: { fontSize: 14, fontWeight: '700', color: '#2a2a44' },
  moreButton: {
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: '#f3f4fb',
  },
  moreLoadingText: {
    paddingVertical: 18,
    textAlign: 'center',
    fontSize: 13,
    color: '#8e8e93',
  },
  date: { fontSize: 16, fontWeight: '600', color: '#727070', marginBottom: 8 },
  item: {
    height: 94,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f3f3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  thumbnail: {
    width: 58,
    height: 73,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  itemText: { height: 73, flex: 1, justifyContent: 'center', gap: 4 },
  badge: {
    height: 19,
    width: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '400' },
  failureBadge: { borderColor: '#fb6f6f' },
  successBadge: { borderColor: '#34c759' },
  failureText: { color: 'red' },
  successText: { color: '#34c759' },
  processingBadge: { borderColor: '#8e8e93' },
  processingText: { color: '#8e8e93' },
  title: { fontSize: 16, fontWeight: '800', color: '#1a1a2e' },
  chevron: { fontSize: 32, lineHeight: 32, color: '#1c1c1e', marginRight: 5 },
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    width: 139,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#1a1a2e',
    opacity: 0.2,
  },
});
