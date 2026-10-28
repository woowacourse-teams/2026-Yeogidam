import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type {
  PlaceReel,
  PlaceReelsApiError,
} from '../../../entities/info/types';
import type { Place } from '../../../entities/place/types';
import type { SavedPlaceViewContext } from '../../../analytics/savedPlaceEvents';
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
  onPressFolder?: () => void;
  onPressDelete?: () => void;
  isInFolder?: boolean;
  isDeleting?: boolean;
  onInteractivePressIn?: () => void;
  hideHeader?: boolean;
  hideBack?: boolean;
  showTitle?: boolean;
  showMetadata?: boolean;
  actionsUnderTitle?: boolean;
  stickyHeader?: boolean;
  titleInHeader?: boolean;
  scrollEnabled?: boolean;
  contentBottomPadding?: number;
  headerTopInset?: number;
  compactHeader?: boolean;
  viewContext?: SavedPlaceViewContext;
  activeTab?: PlaceTab;
  onTabChange?: (tab: PlaceTab) => void;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
};

export function PlaceDetailContent({
  place,
  reels,
  reelsError = null,
  isReelsLoading = false,
  onRetryReels,
  onBack,
  onPressMore,
  onPressFolder,
  onPressDelete,
  isInFolder,
  isDeleting,
  onInteractivePressIn,
  hideHeader = false,
  hideBack = false,
  showTitle = true,
  showMetadata = true,
  actionsUnderTitle = false,
  stickyHeader = false,
  titleInHeader = false,
  scrollEnabled = true,
  contentBottomPadding = 100,
  headerTopInset = 0,
  compactHeader = false,
  viewContext,
  activeTab: controlledTab,
  onTabChange,
  initialScrollOffset,
  onScrollOffsetChange,
}: PlaceDetailContentProps) {
  const [localTab, setActiveTab] = useState<PlaceTab>('게시물');
  const activeTab = controlledTab ?? localTab;

  const handleTabPress = (tab: PlaceTab) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: contentBottomPadding },
      ]}
      contentOffset={
        initialScrollOffset === undefined
          ? undefined
          : { x: 0, y: initialScrollOffset }
      }
      onScroll={
        onScrollOffsetChange
          ? event => onScrollOffsetChange(event.nativeEvent.contentOffset.y)
          : undefined
      }
      scrollEventThrottle={16}
      scrollEnabled={scrollEnabled}
      nestedScrollEnabled
      stickyHeaderIndices={stickyHeader && !hideHeader ? [0] : undefined}
      showsVerticalScrollIndicator={false}
    >
      {hideHeader ? (
        <View style={{ height: headerTopInset }} />
      ) : (
        <PlaceDetailHeader
          onBack={onBack}
          onPressMore={onPressMore}
          onPressFolder={onPressFolder}
          onPressDelete={onPressDelete}
          isInFolder={isInFolder}
          isDeleting={isDeleting}
          onInteractivePressIn={onInteractivePressIn}
          hideBack={hideBack}
          title={place.name}
          titleInHeader={titleInHeader}
          topInset={headerTopInset}
          compact={compactHeader}
        />
      )}
      <View>
        <PlaceInfo
          place={place}
          showTitle={showTitle}
          showCategory={showMetadata}
          showAddress={showMetadata}
          actionsUnderTitle={actionsUnderTitle}
          viewContext={viewContext}
          onInteractivePressIn={onInteractivePressIn}
        />
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
