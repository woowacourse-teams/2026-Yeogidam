import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type {
  PlaceReel,
  PlaceReelsApiError,
} from '../../../entities/info/types';
import type { Place } from '../../../entities/place/types';
import { PlaceDetailHeader } from './PlaceDetailHeader';
import { PlaceInformation } from './PlaceInformation';
import { PlaceInfo } from './PlaceInfo';
import { PlacePostGrid } from './PlacePostGrid';
import { PlaceTabs } from './PlaceTabs';
import type { PlaceTab } from './PlaceTabs';

type PlaceDetailContentProps = {
  place: Place;
  reels: PlaceReel[];
  reelsError?: PlaceReelsApiError | null;
  isReelsLoading?: boolean;
  onRetryReels?: () => void;
  onBack: () => void;
  onPressMore?: () => void;
  hideHeader?: boolean;
  hideBack?: boolean;
  showTitle?: boolean;
  titleInHeader?: boolean;
  scrollEnabled?: boolean;
  contentBottomPadding?: number;
  headerTopInset?: number;
  compactHeader?: boolean;
};

export function PlaceDetailContent({
  place,
  reels,
  reelsError = null,
  isReelsLoading = false,
  onRetryReels,
  onBack,
  onPressMore,
  hideHeader = false,
  hideBack = false,
  showTitle = true,
  titleInHeader = false,
  scrollEnabled = true,
  contentBottomPadding = 100,
  headerTopInset = 0,
  compactHeader = false,
}: PlaceDetailContentProps) {
  const [activeTab, setActiveTab] = useState<PlaceTab>('게시물');

  const handleTabPress = (tab: PlaceTab) => {
    setActiveTab(tab);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: contentBottomPadding },
      ]}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      {hideHeader ? (
        <View style={{ height: headerTopInset }} />
      ) : (
        <PlaceDetailHeader
          onBack={onBack}
          onPressMore={onPressMore}
          hideBack={hideBack}
          title={place.name}
          titleInHeader={titleInHeader}
          topInset={headerTopInset}
          compact={compactHeader}
        />
      )}
      <View>
        <PlaceInfo place={place} showTitle={showTitle} />
      </View>
      <View style={styles.tabsContainer}>
        <PlaceTabs activeTab={activeTab} onTabPress={handleTabPress} />
      </View>
      {activeTab === '게시물' ? (
        <PlacePostGrid
          reels={reels}
          error={reelsError}
          isLoading={isReelsLoading}
          onRetry={onRetryReels}
        />
      ) : null}
      {activeTab === '정보' ? <PlaceInformation place={place} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#ffffff',
  },
  content: {
    flexGrow: 1,
  },
  tabsContainer: {
    backgroundColor: '#ffffff',
  },
});
