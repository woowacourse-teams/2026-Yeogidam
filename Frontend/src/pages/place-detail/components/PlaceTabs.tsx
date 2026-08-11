import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const tabs = ['홈', '게시물'];

export function PlaceTabs() {
  const [activeTab, setActiveTab] = useState('홈');
  const indicatorPosition = useRef(new Animated.Value(0)).current;
  const [tabWidth, setTabWidth] = useState(0);

  const handleTabPress = (tab: string) => {
    if (tab === activeTab) {
      return;
    }

    setActiveTab(tab);
  };

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
      onLayout={event => setTabWidth(event.nativeEvent.layout.width / tabs.length)}>
      {tabs.map(tab => (
        <Pressable
          key={tab}
          style={styles.tabItem}
          onPress={() => handleTabPress(tab)}
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
              width: tabWidth - 44,
              transform: [{
                translateX: indicatorPosition.interpolate({
                  inputRange: [0, 1],
                  outputRange: [22, tabWidth + 22],
                }),
              }],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  tabItem: {
    height: '100%',
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingTop: 2,
  },
  activeTab: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  inactiveTab: {
    fontSize: 14,
    color: '#aeaeb2',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 4,
    backgroundColor: '#1a1a2e',
  },
});
