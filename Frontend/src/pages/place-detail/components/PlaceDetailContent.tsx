import React, { useImperativeHandle, useRef, useState } from 'react';
import {
  type GestureResponderHandlers,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

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
import { PlaceBlogList } from './PlaceBlogList';
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
  /** 지정하면 게시물 탭에서 게시물을 눌렀을 때 앱 안의 게시물 상세로 이동합니다. */
  onOpenReel?: (reel: PlaceReel) => void;
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
  /**
   * 본문(ScrollView 안쪽)에 붙일 터치 응답자입니다. Android에서 본문을 아래로 당겨 시트를 내릴 때 씁니다.
   * 응답자가 ScrollView 안쪽에 있어야 응답자를 잡는 순간 ScrollView가 터치를 가로채지 못합니다.
   */
  contentPanHandlers?: GestureResponderHandlers;
  /** 본문 ScrollView를 직접 스크롤해야 할 때 씁니다. */
  scrollViewRef?: React.Ref<ScrollView>;
  /** 이벤트에 붙는 화면 이름입니다. 지도 시트처럼 다른 화면에서 쓸 때 지정합니다. */
  analyticsScreenName?: string;
};

export function PlaceDetailContent({
  place,
  reels,
  reelsError = null,
  isReelsLoading = false,
  onRetryReels,
  onOpenReel,
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
  contentPanHandlers,
  scrollViewRef,
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
        onOpenReel={onOpenReel}
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
        contentPanHandlers={contentPanHandlers}
        scrollViewRef={scrollViewRef}
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
  onOpenReel,
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
  contentPanHandlers,
  scrollViewRef,
}: Omit<PlaceDetailContentProps, 'analyticsScreenName'>) {
  // 손을 뗀 뒤 본문이 제자리로 튕겨 돌아오는 스크롤은 당김으로 보지 않습니다.
  const isDraggingRef = useRef(false);
  const localScrollRef = useRef<ScrollView>(null);
  useImperativeHandle(scrollViewRef, () => localScrollRef.current as ScrollView, []);
  const headerHeightRef = useRef(0);
  const informationTopRef = useRef(0);
  const { selection } = useScreenAnalytics();
  const [localTab, setActiveTab] = useState<PlaceTab>('게시물');
  const activeTab = controlledTab ?? localTab;

  const handleTabPress = (tab: PlaceTab) => {
    selection('place_tab', tab);
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const hasStickyHeader = stickyHeader && !hideHeader;

  const scrollToMenu = (menuTop: number) => {
    const stickyOffset = hasStickyHeader ? headerHeightRef.current : 0;
    localScrollRef.current?.scrollTo({
      y: Math.max(0, informationTopRef.current + menuTop - stickyOffset),
      animated: true,
    });
  };

  // stickyHeaderIndices가 첫 자식을 헤더로 보므로 Fragment로 묶지 않고 배열로 둡니다.
  const body = [
    hideHeader ? (
      <View key="header" style={{ height: headerTopInset }} />
    ) : (
      <View
        key="header"
        onLayout={event => {
          headerHeightRef.current = event.nativeEvent.layout.height;
        }}
      >
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
      </View>
    ),
    <View key="info">
      <PlaceInfo
        place={place}
        showTitle={showTitle}
        showCategory={showMetadata}
        showAddress={showMetadata}
        actionsUnderTitle={actionsUnderTitle}
        viewContext={viewContext}
        onInteractivePressIn={onInteractivePressIn}
      />
    </View>,
    <View key="tabs" style={styles.tabsContainer}>
      <PlaceTabs activeTab={activeTab} onTabPress={handleTabPress} />
    </View>,
    activeTab === '게시물' ? (
      <PlacePostGrid
        key="posts"
        reels={reels}
        error={reelsError}
        isLoading={isReelsLoading}
        onRetry={onRetryReels}
        onOpenReel={onOpenReel}
      />
    ) : null,
    activeTab === '정보' ? (
      <View
        key="info-tab"
        onLayout={event => {
          informationTopRef.current = event.nativeEvent.layout.y;
        }}
      >
        <PlaceInformation onMenuToggled={scrollToMenu} />
      </View>
    ) : null,
    activeTab === '블로그' ? <PlaceBlogList key="blog-tab" /> : null,
  ];

  return (
    <ScrollView
      ref={localScrollRef}
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
      stickyHeaderIndices={hasStickyHeader ? [0] : undefined}
      showsVerticalScrollIndicator={false}
    >
      {contentPanHandlers ? (
        <View {...contentPanHandlers} style={styles.content}>
          {body}
        </View>
      ) : (
        body
      )}
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
