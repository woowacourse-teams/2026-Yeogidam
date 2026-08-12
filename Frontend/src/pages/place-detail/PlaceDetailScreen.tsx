import React, { useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { placePostMocks } from '../../entities/place-post/mocks';
import { placeMocks } from '../../entities/place/mocks';
import { PlaceDetailHeader } from './components/PlaceDetailHeader';
import { PlaceInfo } from './components/PlaceInfo';
import { PlaceTabs } from './components/PlaceTabs';
import { PlacePostGrid } from './components/PlacePostGrid';

export function PlaceDetailScreen() {
  const scrollViewRef = useRef<ScrollView>(null);
  const tabsOffsetY = useRef(0);
  const place = placeMocks[0];
  const posts = placePostMocks.filter(post => post.placeId === place.id);

  const scrollToTabs = () => {
    scrollViewRef.current?.scrollTo({
      y: tabsOffsetY.current,
      animated: true,
    });
  };

  return (
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
        <PlaceTabs onTabPress={scrollToTabs} />
      </View>
      <PlacePostGrid posts={posts} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingBottom: 120,
  },
});
