import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

const tabs = ['게시물', '정보', '블로그'] as const;

export type PlaceTab = (typeof tabs)[number];

type PlaceTabsProps = {
  activeTab: PlaceTab;
  onTabPress: (tab: PlaceTab) => void;
};

export function PlaceTabs({ activeTab, onTabPress }: PlaceTabsProps) {
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const [tabWidth, setTabWidth] = useState(0);

  useEffect(() => {
    Animated.timing(indicatorPosition, {
      toValue: tabs.indexOf(activeTab),
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [activeTab, indicatorPosition]);

  return (
    <View
      style={styles.container}
      onLayout={event => {
        const { width } = event.nativeEvent.layout;

        setTabWidth(width / tabs.length);
      }}
    >
      {tabs.map(tab => (
        <Pressable
          key={tab}
          style={styles.tabItem}
          onPress={() => onTabPress(tab)}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === activeTab }}
        >
          <Text
            style={tab === activeTab ? styles.activeTab : styles.inactiveTab}
          >
            {tab}
          </Text>
        </Pressable>
      ))}
      {tabWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activeIndicator,
            {
              width: tabWidth,
              transform: [
                {
                  translateX: indicatorPosition.interpolate({
                    inputRange: tabs.map((_, index) => index),
                    outputRange: tabs.map((_, index) => index * tabWidth),
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#ececf0',
    zIndex: 1,
  },
  tabItem: {
    height: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeTab: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  inactiveTab: {
    fontSize: 14,
    lineHeight: 20,
    color: '#aeaeb2',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    bottom: -1,
    height: 2,
    backgroundColor: '#1a1a2e',
  },
});
