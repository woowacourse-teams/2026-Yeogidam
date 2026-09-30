import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import {usePostHog} from 'posthog-react-native';

import {
  capturePlaceMapViewed,
  type SavedPlaceViewContext,
} from '../../../analytics/savedPlaceEvents';

type PlaceMapButtonProps = {
  url: string;
  savedAt?: string;
  viewContext?: SavedPlaceViewContext;
};

export function PlaceMapButton({
  url,
  savedAt,
  viewContext,
}: PlaceMapButtonProps) {
  const posthog = usePostHog();

  const openMap = async () => {
    try {
      await Linking.openURL(url);
      if (savedAt && viewContext) {
        capturePlaceMapViewed(posthog, {
          ...viewContext,
          savedAt,
        });
      }
    } catch {
      // 지도 앱을 열지 못한 경우 활용 이벤트를 기록하지 않습니다.
    }
  };

  return (
    <Pressable
      onPress={openMap}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="link"
      accessibilityLabel="카카오맵으로 바로가기"
    >
      <Text style={styles.icon}>➤</Text>
      <Text style={styles.label}>카카오맵으로 바로가기</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 16,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#C1CBFE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    shadowColor: '#727BA8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  icon: {
    fontSize: 17,
    color: '#1a1a2e',
    transform: [{ rotate: '-25deg' }],
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
