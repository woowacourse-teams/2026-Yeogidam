import React, {useEffect} from 'react';
import {Image, Linking, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {usePostHog} from 'posthog-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {trackHistoryContentDetailViewed} from '../../../analytics/placeExtractionEvents';
import InstagramIcon from '../../../assets/icons/social/instagram-color.svg';
import {
  BOTTOM_NAVIGATION_BAR_HEIGHT,
  getBottomNavigationBarOffset,
} from '../../../components/BottomNavigationBar';
import type {HistoryPlace, HistoryReel, HistoryReelDetail} from '../../../entities/content/types';
import {useHistoryReelDetail} from '../useHistoryReelDetail';
import {HISTORY_FALLBACK_THUMBNAIL, historyStyles} from './historyStyles';

const placeThumbnail =
  'https://www.figma.com/api/mcp/asset/9313bcb8-b3f7-43b7-847e-e794cf94e2d9.png';

/**
 * 장소 분석에 성공한 히스토리 항목의 상세입니다. 찾은 장소를 가로로 보이고 원본 릴스로 보냅니다.
 * 비회원이면 guestDetail을 쓰고 서버에 묻지 않습니다.
 */
export function HistorySuccessDetail({
  onBack,
  reel,
  guestDetail,
}: {
  onBack: () => void;
  reel: HistoryReel;
  guestDetail?: HistoryReelDetail | null;
}) {
  const posthog = usePostHog();
  const {bottom: bottomInset} = useSafeAreaInsets();
  const detailBottomPadding =
    BOTTOM_NAVIGATION_BAR_HEIGHT + getBottomNavigationBarOffset(bottomInset) + 24;
  useEffect(() => {
    trackHistoryContentDetailViewed(posthog, reel.id, 'success');
  }, [posthog, reel.id]);
  const { detail, loading, error } = useHistoryReelDetail(reel, guestDetail);
  const displayReel = detail ?? reel;
  const places =
    detail?.extraction?.extraction_places
      .map(item => item.place)
      .filter((place): place is HistoryPlace => Boolean(place)) ?? [];
  const originalUrl = displayReel.instagram_url;

  return (
    <View style={historyStyles.container}>
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
      <ScrollView
        contentContainerStyle={[
          styles.detailContent,
          {paddingBottom: detailBottomPadding},
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailHero}>
          <Image
            source={displayReel.local_thumbnail_source ?? { uri: displayReel.instagram_thumbnail_url ?? HISTORY_FALLBACK_THUMBNAIL }}
            resizeMode="cover"
            style={historyStyles.detailThumbnail}
          />
          <Text style={historyStyles.detailTitle}>장소 분석이 완료되었어요!</Text>
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
              Linking.openURL(originalUrl).catch(() => undefined);
            }
          }}
          style={[historyStyles.originalButton, !originalUrl && historyStyles.disabledButton]}
        >
          <InstagramIcon width={28} height={27} />
          <Text style={historyStyles.originalText}>원본 릴스로 이동</Text>
          <Text style={historyStyles.detailChevron}>›</Text>
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
              // 히스토리의 장소는 보관함 저장 장소가 아니어서 상세 화면(삭제 등)으로 이동하지 않는다.
              <View key={place.id} style={styles.placeCard}>
                <Image
                  source={place.local_thumbnail_source ?? { uri: place.thumbnail_url ?? placeThumbnail }}
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
      <View style={historyStyles.homeIndicator} />
    </View>
  );
}

const styles = StyleSheet.create({
  detailContent: { paddingBottom: 60 },
  detailHero: { alignItems: 'center', marginTop: 48 },
  detailSubtitle: { fontSize: 14, color: '#8e8e93', marginTop: 8 },
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
});
