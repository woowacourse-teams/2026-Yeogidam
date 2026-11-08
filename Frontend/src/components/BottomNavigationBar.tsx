import React, {useEffect} from 'react';
import {usePostHog} from 'posthog-react-native';

import {trackButtonPressed} from '../analytics/uiEvents';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subscribeRecentShares } from '../entities/content/recent-shares-poller';

import type { MainScreen } from '../types/navigation';

// 보관함의 최근 공유 행이 읽는 공유 목록(앱 공용 폴러)을 로그인 상태에서 계속 갱신해 둡니다.
const RECENT_SHARES_INTERVAL_MS = 5000;

type BottomNavigationBarProps = {
  active: MainScreen;
  isGuest: boolean;
  onNavigate: (screen: MainScreen) => void;
};

export const BOTTOM_NAVIGATION_BAR_HEIGHT = 64;

export function getBottomNavigationBarOffset(bottomInset: number) {
  return bottomInset;
}

export function SystemNavigationGradient() {
  const { bottom } = useSafeAreaInsets();

  if (Platform.OS !== 'android' || bottom <= 0) {
    return null;
  }

  return (
    <LinearGradient
      pointerEvents="none"
      colors={[
        'rgba(31, 34, 56, 0.08)',
        'rgba(31, 34, 56, 0.24)',
        'rgba(31, 34, 56, 0.42)',
      ]}
      end={{ x: 0.5, y: 1 }}
      locations={[0, 0.52, 1]}
      start={{ x: 0.5, y: 0 }}
      style={[styles.systemNavigationGradient, { height: bottom }]}
    />
  );
}

export const bottomNavigationBarContainerStyle: ViewStyle = {
  position: 'absolute',
  left: 16,
  right: 16,
  minHeight: BOTTOM_NAVIGATION_BAR_HEIGHT,
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: '#ffffff',
  shadowColor: '#000000',
  shadowOpacity: 0.09,
  shadowOffset: {
    width: 0,
    height: 8,
  },
  shadowRadius: 20,
  elevation: 10,
};

const navigationItems: {
  id: MainScreen;
  icon: 'bookmark' | 'map' | 'person';
  label: string;
}[] = [
  // 보관함이 앱의 시작 화면이라 가장 앞에 둡니다.
  { id: 'saved', icon: 'bookmark', label: '보관함' },
  // 대기함 흐름을 다시 사용할 때 복원합니다.
  // { id: 'inBox', icon: 'inventory-2', label: '대기함' },
  { id: 'map', icon: 'map', label: '지도' },
  { id: 'my', icon: 'person', label: '내 정보' },
];

export function BottomNavigationBar({
  active,
  isGuest,
  onNavigate,
}: BottomNavigationBarProps) {
  const { bottom } = useSafeAreaInsets();
  const posthog = usePostHog();

  useEffect(() => {
    if (isGuest) {
      return;
    }
    // 앱 공용 폴러를 구독해 첫 조회와 주기 갱신을 이어 둡니다. 결과는 폴러를 구독한
    // 화면(보관함 최근 공유 등)이 받아 씁니다. 포그라운드 복귀 시 다시 읽는 것도 폴러가 맡습니다.
    const subscription = subscribeRecentShares({
      intervalMs: RECENT_SHARES_INTERVAL_MS,
      onResult: () => undefined,
    });
    // 조회가 실패해도 탭 이동은 그대로 쓸 수 있어야 합니다.
    subscription.refresh().catch(() => undefined);
    return () => subscription.unsubscribe();
  }, [isGuest]);

  return (
    <View
      style={[
        styles.navigationBar,
        {
          paddingBottom: bottom,
        },
      ]}
    >
      <SystemNavigationGradient />
      <View style={styles.navigationItems}>
        {navigationItems.map(navigation => (
          <Pressable
            key={navigation.id}
            accessibilityRole="button"
            accessibilityLabel={navigation.label}
            accessibilityState={{selected: active === navigation.id}}
            onPress={() => {
              trackButtonPressed(posthog, active, 'bottom_tab', {
                target_tab: navigation.id,
                is_same_tab: navigation.id === active,
              });
              onNavigate(navigation.id);
            }}
            style={({ pressed }) => [
              styles.navigation,
              pressed && styles.pressedNavigation,
            ]}
          >
            <View style={styles.navigationInner}>
              {navigation.id === 'my' && active !== navigation.id ? (
                <Svg height={24} viewBox="0 0 24 24" width={24}>
                  <Path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0-6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 7c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm6 5H6v-.99c.2-.72 3.3-2.01 6-2.01s5.8 1.29 6 2v1z"
                    fill="#666b79"
                  />
                </Svg>
              ) : navigation.id === 'map' && active !== navigation.id ? (
                <Svg height={24} viewBox="0 0 24 24" width={24}>
                  <Path
                    d="M3.5 5 9 3.2l6 1.9 5.5-1.8v15.4L15 20.8l-6-1.9-5.5 1.8V5ZM9 3.2v15.7m6-13.8v15.7"
                    fill="none"
                    stroke="#666b79"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.2}
                  />
                </Svg>
              ) : navigation.id === 'saved' && active !== navigation.id ? (
                <Svg height={24} viewBox="0 0 24 24" width={24}>
                  <Path
                    d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15-5-2.18L7 18V5h10v13z"
                    fill="#666b79"
                    stroke="#666b79"
                    strokeWidth={0.3}
                  />
                </Svg>
              ) : (
                <MaterialIcons
                  color={active === navigation.id ? '#1f2238' : '#666b79'}
                  name={navigation.icon}
                  size={active === navigation.id ? 24 : 23}
                />
              )}
              <Text
                style={[
                  styles.navigationText,
                  active === navigation.id && styles.activeText,
                ]}
              >
                {navigation.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navigationBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
  },
  navigationItems: {
    height: BOTTOM_NAVIGATION_BAR_HEIGHT,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth * 1.5,
    borderTopColor: '#d9dbe0',
    backgroundColor: '#ffffff',
  },
  systemNavigationGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  navigation: {
    flex: 1,
    minHeight: 46,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navigationInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  pressedNavigation: {
    opacity: 0.82,
  },
  navigationText: {
    fontSize: 10,
    color: '#666b79',
  },
  activeText: {
    color: '#1f2238',
    fontWeight: '800',
  },
});
