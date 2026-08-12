import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { placePostMocks } from '../../entities/place-post/mocks';
import { placeMocks } from '../../entities/place/mocks';
import { PlaceDetailHeader } from './components/PlaceDetailHeader';
import { PlaceInformation } from './components/PlaceInformation';
import { PlaceInfo } from './components/PlaceInfo';
import { PlaceMapButton } from './components/PlaceMapButton';
import { PlaceTabs } from './components/PlaceTabs';
import type { PlaceTab } from './components/PlaceTabs';
import { PlacePostGrid } from './components/PlacePostGrid';

export function PlaceDetailScreen() {
  const scrollViewRef = useRef<ScrollView>(null);
  const tabsOffsetY = useRef(0);
  const [activeTab, setActiveTab] = useState<PlaceTab>('게시물');
  const place = placeMocks[0];
  const posts = placePostMocks.filter(post => post.placeId === place.id);

  const scrollToTabs = () => {
    scrollViewRef.current?.scrollTo({
      y: tabsOffsetY.current,
      animated: true,
    });
  };

  const handleTabPress = (tab: PlaceTab) => {
    setActiveTab(tab);
    requestAnimationFrame(scrollToTabs);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[2]}
        showsVerticalScrollIndicator={false}
      >
        <PlaceDetailHeader />
        <View
          onLayout={event => {
            const { y, height } = event.nativeEvent.layout;

            tabsOffsetY.current = y + height;
          }}
        >
          <PlaceInfo place={place} />
        </View>
        <View>
          <PlaceTabs activeTab={activeTab} onTabPress={handleTabPress} />
        </View>
        {activeTab === '게시물' ? <PlacePostGrid posts={posts} /> : null}
        {activeTab === '정보' ? <PlaceInformation place={place} /> : null}
      </ScrollView>
      {place.placeUrl ? <PlaceMapButton url={place.placeUrl} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingBottom: 100,
  },
});
