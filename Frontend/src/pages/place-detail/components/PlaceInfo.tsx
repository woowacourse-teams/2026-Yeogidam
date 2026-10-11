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
import type { Place } from '../../../entities/place/types';
import { useCopyToast } from './CopyToast';

type PlaceInfoProps = {
  place: Place;
  onPressMore?: () => void;
  showTitle?: boolean;
  showCategory?: boolean;
  actionsUnderTitle?: boolean;
  viewContext?: SavedPlaceViewContext;
};

export function PlaceInfo({
  place,
  onPressMore,
  showTitle = true,
  showCategory = true,
  actionsUnderTitle = false,
  viewContext,
}: PlaceInfoProps) {
  const posthog = usePostHog();
  const { showCopyToast } = useCopyToast();

  const copyAddress = () => {
    Clipboard.setString(place.fullAddress);
    showCopyToast('도로명 주소가 복사되었습니다.');
  };

  const openKakaoMap = async () => {
    const hasCoordinates =
      place.latitude !== undefined && place.longitude !== undefined;
    const appPlaceUrl = hasCoordinates
      ? `kakaomap://look?p=${place.latitude},${place.longitude}`
      : `kakaomap://search?q=${encodeURIComponent(place.name)}`;
    const webPlaceUrl = hasCoordinates
      ? `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.latitude},${place.longitude}`
      : `https://map.kakao.com/link/search/${encodeURIComponent(place.name)}`;

    try {
      await Linking.openURL(place.placeUrl ?? appPlaceUrl);
    } catch {
      if (place.placeUrl && place.placeUrl !== appPlaceUrl) {
        try {
          await Linking.openURL(appPlaceUrl);
        } catch {
          try {
            await Linking.openURL(webPlaceUrl);
          } catch {
            return;
          }
        }
      } else {
        try {
          await Linking.openURL(webPlaceUrl);
        } catch {
          return;
        }
      }
    }

    if (place.savedAt && viewContext) {
      capturePlaceMapViewed(posthog, {
        ...viewContext,
        savedAt: place.savedAt,
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
        accessibilityLabel={`${place.name} 카카오맵 열기`}
        onPress={() => {
          openKakaoMap().catch(() => undefined);
        }}
        style={({ pressed }) => [
          styles.actionButton,
          styles.mapButton,
          pressed && styles.actionPressed,
        ]}
      >
        <Text style={styles.kakaoMark}>K</Text>
        <Text style={styles.directionsLabel}>카카오맵</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="주소 복사"
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
                onPress={onPressMore}
                style={styles.moreButton}
              >
                <MaterialIcons color="#1a1a2e" name="more-vert" size={24} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {actionsUnderTitle ? actions : null}
        {showCategory && place.category ? (
          <View style={styles.metaRow}>
            <MaterialIcons color="#85869A" name="sell" size={16} />
            <Text style={styles.category} numberOfLines={1}>
              {getMiddleCategory(place.category)}
            </Text>
          </View>
        ) : null}
        <View style={styles.addressRow}>
          <MaterialIcons color="#85869A" name="place" size={17} />
          <Text style={styles.address} numberOfLines={1}>
            {place.fullAddress}
          </Text>
        </View>
        {!actionsUnderTitle ? actions : null}
      </View>
      <View style={styles.imageContainer}>
        <Image source={place.image} style={styles.image} />
      </View>
    </View>
  );
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
    overflow: 'hidden',
    borderRadius: 16,
  },
  image: {
    width: '100%',
    height: 190,
    resizeMode: 'cover',
  },
});
