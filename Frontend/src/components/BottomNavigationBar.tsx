import React, {useCallback, useEffect, useRef, useState} from 'react';
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
import type { HistoryReel } from '../entities/content/types';
import {
  getLastSeenHistorySnapshot,
  setLastSeenHistorySnapshot,
} from '../lib/history-notification-storage';

import type { MainScreen } from '../types/navigation';

const HISTORY_NOTIFICATION_INTERVAL_MS = 5000;

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
  icon: 'bookmark' | 'map' | 'person' | 'history';
  label: string;
}[] = [
  { id: 'history', icon: 'history', label: '히스토리' },
  // 대기함 흐름을 다시 사용할 때 복원합니다.
  // { id: 'inBox', icon: 'inventory-2', label: '대기함' },
  { id: 'saved', icon: 'bookmark', label: '보관함' },
  { id: 'map', icon: 'map', label: '지도' },
  { id: 'my', icon: 'person', label: '내 정보' },
];

export function BottomNavigationBar({
  active,
  isGuest,
  onNavigate,
}: BottomNavigationBarProps) {
  const { bottom } = useSafeAreaInsets();
  const [isHistoryUnread, setIsHistoryUnread] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  const syncHistoryNotification = useCallback(async (reels: HistoryReel[]) => {
    // 히스토리 화면이 같은 결과로 마지막 확인 시점을 갱신하므로 그 화면에서는 판단하지 않는다.
    if (activeRef.current === 'history') {
      setIsHistoryUnread(false);
      return;
    }
    const latest = reels[0];
    if (!latest) {
      setIsHistoryUnread(false);
      return;
    }
    const lastSeen = await getLastSeenHistorySnapshot();
    if (lastSeen === null) {
      await setLastSeenHistorySnapshot({
        id: latest.id,
        status: latest.processing_status,
      });
      setIsHistoryUnread(false);
      return;
    }
    setIsHistoryUnread(
      lastSeen.id !== latest.id ||
        lastSeen.status !== latest.processing_status,
    );
  }, []);

  useEffect(() => {
    if (isGuest) {
      setIsHistoryUnread(false);
      return;
    }
    // 앱 공용 폴러를 5초 주기로 구독한다. 히스토리 등 더 짧은 구독자가 있으면 그 주기를 따른다.
    // 포그라운드 복귀 시 다시 읽는 것도 폴러가 맡는다.
    const subscription = subscribeRecentShares({
      intervalMs: HISTORY_NOTIFICATION_INTERVAL_MS,
      onResult: ({reels}) => {
        // Keep the navigation usable if the history request fails.
        syncHistoryNotification(reels).catch(() => undefined);
      },
    });
    subscription.refresh().catch(() => undefined);
    return () => subscription.unsubscribe();
  }, [isGuest, syncHistoryNotification]);

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
            onPress={() => {
              // 마지막 확인 시점은 히스토리 화면이 첫 페이지를 읽을 때 저장한다.
              if (navigation.id === 'history') setIsHistoryUnread(false);
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
              ) : navigation.id === 'history' ? (
                <View>
                  <Svg height={24} viewBox="0 0 24 24" width={24}>
                    {active === navigation.id ? (
                      <>
                        <Path
                          d="M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z"
                          fill="#000000"
                          stroke="#000000"
                          strokeWidth={2}
                        />
                        <Path
                          fill="none"
                          d="M12 8v4.3l3 1.8"
                          stroke="#ffffff"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.8}
                        />
                      </>
                    ) : (
                      <>
                        <Path
                          d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z"
                          fill="none"
                          stroke="#666b79"
                          strokeWidth={2}
                        />
                        <Path
                          d="M12 7.5v4.8l3.2 1.9"
                          fill="none"
                          stroke="#666b79"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      </>
                    )}
                  </Svg>
                  {isHistoryUnread && active !== navigation.id ? (
                    <View style={styles.historyBadge} />
                  ) : null}
                </View>
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
  historyBadge: {
    position: 'absolute',
    right: -2,
    top: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f04438',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  activeText: {
    color: '#1f2238',
    fontWeight: '800',
  },
});
