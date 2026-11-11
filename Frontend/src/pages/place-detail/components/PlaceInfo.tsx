import Clipboard from '@react-native-clipboard/clipboard';
import React from 'react';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePostHog } from 'posthog-react-native';

import {
  capturePlaceMapViewed,
  type SavedPlaceViewContext,
} from '../../../analytics/savedPlaceEvents';
import { useScreenAnalytics } from '../../../analytics/uiEvents';
import type { Place } from '../../../entities/place/types';
import { useCopyToast } from './CopyToast';

type PlaceInfoProps = {
  place: Place;
  onPressMore?: () => void;
  showTitle?: boolean;
  showCategory?: boolean;
  showAddress?: boolean;
  actionsUnderTitle?: boolean;
  onInteractivePressIn?: () => void;
  viewContext?: SavedPlaceViewContext;
};

export function PlaceInfo({
  place,
  onPressMore,
  showTitle = true,
  showCategory = true,
  showAddress = true,
  actionsUnderTitle = false,
  onInteractivePressIn,
  viewContext,
}: PlaceInfoProps) {
  const posthog = usePostHog();
  const { button } = useScreenAnalytics();
  const { showCopyToast } = useCopyToast();

  const copyAddress = () => {
    button('copy_address');
    Clipboard.setString(place.fullAddress);
    showCopyToast('도로명 주소가 복사되었습니다.');
  };

  const isGooglePlace = place.mapProvider === 'GOOGLE';
  const mapLabel = isGooglePlace ? '구글맵' : '카카오맵';

  const openMap = async () => {
    const opened = isGooglePlace
      ? await openGoogleMap(place)
      : await openKakaoMap(place);
    if (!opened) return;

    if (place.savedAt && viewContext) {
      capturePlaceMapViewed(posthog, {
        ...viewContext,
        savedAt: place.savedAt,
        mapProvider: isGooglePlace ? 'google' : 'kakao',
      });
    }
  };

  const actions = (
    <View
      style={[
        styles.actions,
        actionsUnderTitle && styles.actionsUnderTitle,
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${place.name} ${mapLabel} 열기`}
        onPressIn={onInteractivePressIn}
        onPress={() => {
          button(isGooglePlace ? 'open_google_map' : 'open_kakao_map');
          openMap().catch(() => undefined);
        }}
        style={({ pressed }) => [
          styles.actionButton,
          styles.mapButton,
          pressed && styles.actionPressed,
        ]}
      >
        <Text style={styles.kakaoMark}>{isGooglePlace ? 'G' : 'K'}</Text>
        <Text style={styles.directionsLabel}>{mapLabel}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="주소 복사"
        onPressIn={onInteractivePressIn}
        onPress={copyAddress}
        style={({ pressed }) => [
          styles.actionButton,
          styles.copyButton,
          pressed && styles.actionPressed,
        ]}
      >
        <MaterialIcons color="#1a1a2e" name="content-copy" size={15} />
        <Text style={styles.copyLabel}>주소 복사</Text>
      </Pressable>
    </View>
  );

  return (
    <View>
      <View style={styles.summary}>
        {showTitle ? (
          <View style={styles.titleRow}>
            <Text style={styles.name}>{place.name}</Text>
            {onPressMore ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="더보기"
                hitSlop={8}
                onPressIn={onInteractivePressIn}
                onPress={() => {
                  button('more');
                  onPressMore();
                }}
                style={styles.moreButton}
              >
                <MaterialIcons color="#1a1a2e" name="more-vert" size={24} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {actionsUnderTitle ? actions : null}
        {showCategory && place.category ? (
          // 아이콘은 따로 잡히지 않게 줄 전체를 하나로 묶고, 무슨 정보인지 이름을 붙여 읽습니다.
          <View
            accessible
            accessibilityLabel={`카테고리, ${getMiddleCategory(place.category)}`}
            style={styles.metaRow}
          >
            <MaterialIcons color="#85869A" name="sell" size={16} />
            <Text style={styles.category} numberOfLines={1}>
              {getMiddleCategory(place.category)}
            </Text>
          </View>
        ) : null}
        {showAddress ? (
          <View
            accessible
            accessibilityLabel={`주소, ${place.fullAddress}`}
            style={styles.addressRow}
          >
            <MaterialIcons color="#85869A" name="place" size={17} />
            <Text style={styles.address} numberOfLines={1}>
              {place.fullAddress}
            </Text>
          </View>
        ) : null}
        {!actionsUnderTitle ? actions : null}
      </View>
      <View style={styles.imageContainer}>
        <Image source={place.image} style={styles.image} />
      </View>
    </View>
  );
}

/** 앞에서부터 차례로 열어 보고, 하나라도 열리면 true를 돌려줍니다. */
async function openFirstAvailable(urls: string[]) {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // 다음 링크로 넘어갑니다.
    }
  }
  return false;
}

function hasCoordinates(place: Place) {
  return place.latitude !== undefined && place.longitude !== undefined;
}

function openKakaoMap(place: Place) {
  const appPlaceUrl = hasCoordinates(place)
    ? `kakaomap://look?p=${place.latitude},${place.longitude}`
    : `kakaomap://search?q=${encodeURIComponent(place.name)}`;
  const webPlaceUrl = hasCoordinates(place)
    ? `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.latitude},${place.longitude}`
    : `https://map.kakao.com/link/search/${encodeURIComponent(place.name)}`;
  const urls = [place.placeUrl, appPlaceUrl, webPlaceUrl].filter(
    (url): url is string => Boolean(url),
  );
  return openFirstAvailable([...new Set(urls)]);
}

/** 서버 `placeUrl`(구글맵 검색 링크)을 열고, 없으면 좌표나 이름으로 구글맵을 엽니다. */
function openGoogleMap(place: Place) {
  const query = hasCoordinates(place)
    ? `${place.latitude},${place.longitude}`
    : place.name;
  const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const urls = [place.placeUrl, fallbackUrl].filter(
    (url): url is string => Boolean(url),
  );
  return openFirstAvailable([...new Set(urls)]);
}

function getMiddleCategory(category: string) {
  const categories = category
    .split('>')
    .map(value => value.trim())
    .filter(Boolean);
  return categories[1] ?? categories[0];
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: 24,
    paddingTop: 2,
    paddingBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  moreButton: {
    width: 40,
    height: 40,
    marginRight: -10,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  category: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#66666F',
  },
  metaRow: {
    minHeight: 22,
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  actionsUnderTitle: {
    marginTop: 2,
    paddingBottom: 4,
  },
  actionButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapButton: {
    backgroundColor: '#E7E9FF',
  },
  kakaoMark: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '800',
    color: '#4456C8',
  },
  directionsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4456C8',
  },
  copyButton: {
    backgroundColor: '#F1F1F5',
  },
  copyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  actionPressed: {
    opacity: 0.58,
  },
  addressRow: {
    minHeight: 26,
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  address: {
    flex: 1,
    flexShrink: 1,
    fontSize: 14,
    color: '#55555F',
  },
  imageContainer: {
    marginHorizontal: 24,
    marginTop: 6,
    marginBottom: 16,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#d9dce8',
  },
  image: {
    width: '100%',
    height: 190,
    resizeMode: 'cover',
  },
});
