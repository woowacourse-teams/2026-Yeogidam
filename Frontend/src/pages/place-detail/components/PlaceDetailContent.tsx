import React, {useRef, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';

import type {PlacePost} from '../../../entities/place-post/types';
import type {Place} from '../../../entities/place/types';
import {PlaceDetailHeader} from './PlaceDetailHeader';
import {PlaceInformation} from './PlaceInformation';
import {PlaceInfo} from './PlaceInfo';
import {PlacePostGrid} from './PlacePostGrid';
import {PlaceTabs} from './PlaceTabs';
import type {PlaceTab} from './PlaceTabs';

type PlaceDetailContentProps = {
  place: Place;
  posts: PlacePost[];
  onBack: () => void;
  scrollEnabled?: boolean;
  contentBottomPadding?: number;
};

export function PlaceDetailContent({
  place,
  posts,
  onBack,
  scrollEnabled = true,
  contentBottomPadding = 100,
}: PlaceDetailContentProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const tabsOffsetY = useRef(0);
  const [activeTab, setActiveTab] = useState<PlaceTab>('게시물');

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
    <ScrollView
      ref={scrollViewRef}
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {paddingBottom: contentBottomPadding},
      ]}
      scrollEnabled={scrollEnabled}
      stickyHeaderIndices={[2]}
      showsVerticalScrollIndicator={false}>
      <PlaceDetailHeader onBack={onBack} />
      <View
        onLayout={event => {
          const {y, height} = event.nativeEvent.layout;

          tabsOffsetY.current = y + height;
        }}>
        <PlaceInfo place={place} />
      </View>
      <View>
        <PlaceTabs activeTab={activeTab} onTabPress={handleTabPress} />
      </View>
      {activeTab === '게시물' ? <PlacePostGrid posts={posts} /> : null}
      {activeTab === '정보' ? <PlaceInformation place={place} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
  },
});
