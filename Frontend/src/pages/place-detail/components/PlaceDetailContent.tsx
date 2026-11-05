import React, { useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type {
  PlaceReel,
  PlaceReelsApiError,
} from '../../../entities/info/types';
import type { Place } from '../../../entities/place/types';
import type { SavedPlaceViewContext } from '../../../analytics/savedPlaceEvents';
import {
  AnalyticsScreenContext,
  useScreenAnalytics,
} from '../../../analytics/uiEvents';
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
  /** 사용자가 맨 위에서 본문을 아래로 당긴 거리입니다. iOS에서 본문이 튕길 때만 0보다 큽니다. */
  onTopPull?: (distance: number) => void;
  /** 맨 위에서 당기던 손을 놓을 때 당긴 거리와 세로 속도(pt/ms)를 넘깁니다. */
  onTopPullRelease?: (distance: number, velocityY: number) => void;
  /** 이벤트에 붙는 화면 이름입니다. 지도 시트처럼 다른 화면에서 쓸 때 지정합니다. */
  analyticsScreenName?: string;
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
  onTopPull,
  onTopPullRelease,
  analyticsScreenName = 'place_detail',
}: PlaceDetailContentProps) {
  return (
    <AnalyticsScreenContext.Provider value={analyticsScreenName}>
      <PlaceDetailContentBody
        place={place}
        reels={reels}
        reelsError={reelsError}
        isReelsLoading={isReelsLoading}
        onRetryReels={onRetryReels}
        onBack={onBack}
        onPressMore={onPressMore}
        onPressFolder={onPressFolder}
        onPressDelete={onPressDelete}
        isInFolder={isInFolder}
        isDeleting={isDeleting}
        onInteractivePressIn={onInteractivePressIn}
        hideHeader={hideHeader}
        hideBack={hideBack}
        showTitle={showTitle}
        showMetadata={showMetadata}
        actionsUnderTitle={actionsUnderTitle}
        stickyHeader={stickyHeader}
        titleInHeader={titleInHeader}
        scrollEnabled={scrollEnabled}
        contentBottomPadding={contentBottomPadding}
        headerTopInset={headerTopInset}
        compactHeader={compactHeader}
        viewContext={viewContext}
        activeTab={controlledTab}
        onTabChange={onTabChange}
        initialScrollOffset={initialScrollOffset}
        onScrollOffsetChange={onScrollOffsetChange}
        onTopPull={onTopPull}
        onTopPullRelease={onTopPullRelease}
      />
    </AnalyticsScreenContext.Provider>
  );
}

function PlaceDetailContentBody({
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
  onTopPull,
  onTopPullRelease,
}: Omit<PlaceDetailContentProps, 'analyticsScreenName'>) {
  // 손을 뗀 뒤 본문이 제자리로 튕겨 돌아오는 스크롤은 당김으로 보지 않습니다.
  const isDraggingRef = useRef(false);
  const { selection } = useScreenAnalytics();
  const [localTab, setActiveTab] = useState<PlaceTab>('게시물');
  const activeTab = controlledTab ?? localTab;

  const handleTabPress = (tab: PlaceTab) => {
    selection('place_tab', tab);
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
        onScrollOffsetChange || onTopPull
          ? event => {
              const offset = event.nativeEvent.contentOffset.y;
              onScrollOffsetChange?.(offset);
              if (isDraggingRef.current) onTopPull?.(Math.max(0, -offset));
            }
          : undefined
      }
      onScrollBeginDrag={() => {
        isDraggingRef.current = true;
      }}
      onScrollEndDrag={event => {
        isDraggingRef.current = false;
        const { contentOffset, velocity } = event.nativeEvent;
        onTopPullRelease?.(Math.max(0, -contentOffset.y), velocity?.y ?? 0);
      }}
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
