import React, { useImperativeHandle, useRef, useState } from 'react';
import {
  type GestureResponderHandlers,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type {
  PlaceBlogSearchResult,
  PlaceDetailInfo,
  PlaceReel,
  PlaceReelsApiError,
} from '../../../entities/info/types';
import type { Place } from '../../../entities/place/types';
import type { SavedPlaceViewContext } from '../../../analytics/savedPlaceEvents';
import {
  AnalyticsScreenContext,
  useScreenAnalytics,
} from '../../../analytics/uiEvents';
import {
  toBlogListItems,
  toMenuItems,
  toMenuPriceRange,
  toWeeklyHours,
} from '../placeDetailFormat';
import type { PlaceResource } from '../usePlaceDetailData';
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
  placeInfo?: PlaceResource<PlaceDetailInfo>;
  placeBlogs?: PlaceResource<PlaceBlogSearchResult>;
  onBack: () => void;
  onPressMore?: () => void;
  onPressFolder?: () => void;
  onPressDelete?: () => void;
  isBookmarked?: boolean;
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
  placeInfo,
  placeBlogs,
  isBookmarked,
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
        placeInfo={placeInfo}
        placeBlogs={placeBlogs}
        isBookmarked={isBookmarked}
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
  placeInfo,
  placeBlogs,
  isBookmarked,
}: Omit<PlaceDetailContentProps, 'analyticsScreenName'>) {
  // 손을 뗀 뒤 본문이 제자리로 튕겨 돌아오는 스크롤은 당김으로 보지 않습니다.
  const isDraggingRef = useRef(false);
  const localScrollRef = useRef<ScrollView>(null);
  useImperativeHandle(scrollViewRef, () => localScrollRef.current as ScrollView, []);
  const tabsTopRef = useRef(0);
  const scrollOffsetRef = useRef(initialScrollOffset ?? 0);
  const [isTabsPinned, setIsTabsPinned] = useState(false);
  const [scrollViewHeight, setScrollViewHeight] = useState(0);
  const [tabsHeight, setTabsHeight] = useState(0);
  const { selection } = useScreenAnalytics();
  const [localTab, setActiveTab] = useState<PlaceTab>('게시물');
  const activeTab = controlledTab ?? localTab;

  const handleTabPress = (tab: PlaceTab) => {
    selection('place_tab', tab);
    setActiveTab(tab);
    onTabChange?.(tab);
    // 이미 고정된 상태에서는 내용만 바뀐 것처럼 보이도록 애니메이션 없이 옮깁니다.
    localScrollRef.current?.scrollTo({
      y: tabsTopRef.current,
      animated: !isTabsPinned,
    });
  };

  const hasStickyHeader = stickyHeader && !hideHeader;

  const scrollToMenu = (menuTop: number) => {
    localScrollRef.current?.scrollTo({
      y: tabsTopRef.current + menuTop,
      animated: true,
    });
  };

  const updateTabsPinned = (offset: number) => {
    const tabsTop = tabsTopRef.current;
    setIsTabsPinned(tabsTop > 0 && Math.ceil(offset) >= Math.floor(tabsTop));
  };

  const tabs = <PlaceTabs activeTab={activeTab} onTabPress={handleTabPress} />;
  // 내용이 짧아도 탭이 상단에 딱 붙는 지점까지만 스크롤되는 높이입니다.
  const tabContentMinHeight = Math.max(
    0,
    scrollViewHeight - tabsHeight - contentBottomPadding,
  );

  const header = hideHeader ? null : (
    <PlaceDetailHeader
      onBack={onBack}
      onPressMore={onPressMore}
      onPressFolder={onPressFolder}
      onPressDelete={onPressDelete}
      isBookmarked={isBookmarked}
      isInFolder={isInFolder}
      isDeleting={isDeleting}
      onInteractivePressIn={onInteractivePressIn}
      hideBack={hideBack}
      title={place.name}
      titleInHeader={titleInHeader}
      topInset={headerTopInset}
      compact={compactHeader}
    />
  );

  return (
    <View style={styles.container}>
      {hasStickyHeader ? header : null}
      <View style={styles.container}>
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
          onLayout={event => {
            setScrollViewHeight(event.nativeEvent.layout.height);
          }}
          onScroll={event => {
            const offset = event.nativeEvent.contentOffset.y;
            scrollOffsetRef.current = offset;
            updateTabsPinned(offset);
            onScrollOffsetChange?.(offset);
            if (isDraggingRef.current) onTopPull?.(Math.max(0, -offset));
          }}
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
          showsVerticalScrollIndicator={false}
        >
          <View {...contentPanHandlers} style={styles.content}>
            {hideHeader ? <View style={{ height: headerTopInset }} /> : null}
            {hasStickyHeader ? null : header}
            <PlaceInfo
              place={place}
              showTitle={showTitle}
              showCategory={showMetadata}
              showAddress={showMetadata}
              actionsUnderTitle={actionsUnderTitle}
              viewContext={viewContext}
              onInteractivePressIn={onInteractivePressIn}
            />
            <View
              style={styles.tabsContainer}
              onLayout={event => {
                tabsTopRef.current = event.nativeEvent.layout.y;
                setTabsHeight(event.nativeEvent.layout.height);
                updateTabsPinned(scrollOffsetRef.current);
              }}
            >
              {tabs}
            </View>
            <View style={[styles.content, { minHeight: tabContentMinHeight }]}>
              {activeTab === '게시물' ? (
                <PlacePostGrid
                  reels={reels}
                  error={reelsError}
                  isLoading={isReelsLoading}
                  onRetry={onRetryReels}
                  onOpenReel={onOpenReel}
                />
              ) : null}
              {activeTab === '정보' ? (
                <PlaceInformation
                  weeklyHours={toWeeklyHours(placeInfo?.data?.openingHours ?? null)}
                  menuPriceRange={toMenuPriceRange(placeInfo?.data?.menus ?? [])}
                  menuItems={toMenuItems(placeInfo?.data?.menus ?? [])}
                  isLoading={placeInfo?.isLoading}
                  error={placeInfo?.error}
                  onRetry={placeInfo?.retry}
                  onMenuToggled={scrollToMenu}
                />
              ) : null}
              {activeTab === '블로그' ? (
                <PlaceBlogList
                  posts={toBlogListItems(placeBlogs?.data ?? null)}
                  isLoading={placeBlogs?.isLoading}
                  error={placeBlogs?.error}
                  onRetry={placeBlogs?.retry}
                />
              ) : null}
            </View>
          </View>
        </ScrollView>
        {/*
          RN stickyHeaderIndices는 내용 높이가 바뀌면 탭 위치가 어긋나므로 스크롤 밖에 겹쳐 둡니다.
          선택 표시 위치를 유지하도록 숨길 때도 마운트해 둡니다.
          스크린 리더에는 스크롤 안의 탭 하나만 보여 줍니다. 겹친 탭까지 보이면 같은 탭이 두 번 나오고,
          스크롤 밖에 있어 읽는 순서가 맨 뒤로 밀려요.
        */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents={isTabsPinned ? 'auto' : 'none'}
          style={[styles.pinnedTabs, !isTabsPinned && styles.pinnedTabsHidden]}
        >
          {tabs}
        </View>
      </View>
    </View>
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
  pinnedTabs: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
  },
  pinnedTabsHidden: {
    opacity: 0,
  },
});
