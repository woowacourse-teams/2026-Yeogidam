import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Image,
  Linking,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {MaterialIcons} from '@react-native-vector-icons/material-icons/static';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useScreenAnalytics} from '../../analytics/uiEvents';
import {getHistoryReelDetail} from '../../entities/content/history-api';
import {normalizeReelCaption} from '../../entities/content/title';
import type {
  HistoryReel,
  HistoryReelPlace,
} from '../../entities/content/types';
import {getMiddleCategory} from '../../entities/place/category';

type ReelDetailScreenProps = {
  reel: HistoryReel;
  onBack: () => void;
};

const COLLAPSED_RATIO = 600 / 844;
const EXPANDED_RATIO = 250 / 844;
const SHEET_RADIUS = 28;
const PHOTO_WIDTH = 100;
const PHOTO_HEIGHT = 92;
const ROW_HEIGHT = 116;
const COLLAPSED_CAPTION_LINES = 2;
const FOLD_BAR_HEIGHT = 44;

// 이전 버튼이 있는 위쪽 띠(상태 표시줄 + 상단 버튼). 스와이프 뒤로가기 구역에서 뺍니다.
const TOP_BAR_CLEARANCE = 100;

/**
 * 앱의 스와이프 뒤로가기는 화면 왼쪽 40px를 터치 시작부터 가로챕니다. 이전 버튼과 왼쪽 정렬된
 * 접힌 캡션·접기 버튼이 그 안에 걸려 눌리지 않을 수 있으므로, 그 위치만 구역에서 빼 줍니다.
 */
export function getReelBackGestureRegion(windowHeight: number) {
  const collapsedTop = Math.round(windowHeight * COLLAPSED_RATIO);
  return {
    top: TOP_BAR_CLEARANCE,
    bottom: windowHeight - (collapsedTop - FOLD_BAR_HEIGHT - 16),
  };
}

// 시트 윗부분(손잡이 + 제목 줄) 높이. 펼친 상태에서 이 안에서 시작한 아래로 끌기는 시트를 접습니다.
const SHEET_DRAG_AREA_HEIGHT = 64;

type SheetDragInput = {
  dx: number;
  dy: number;
  /** 끌기를 시작한 화면 y 위치 */
  startY: number;
  /** 지금 시트 윗선의 y 위치 */
  sheetTop: number;
  isExpanded: boolean;
  isCaptionOpen: boolean;
};

/**
 * 세로 끌기를 시트 제스처로 받을지 정합니다.
 * - 접힌 상태: 위로 끌기를 화면 어디서든 받습니다. 캡션이 펼쳐져 있으면 캡션 스크롤과 겹치지 않게
 *   시트에서 시작한 끌기만 받습니다.
 * - 펼친 상태: 장소 목록 스크롤과 겹치지 않게, 시트 윗부분이나 이미지 영역에서 시작한
 *   아래로 끌기만 받습니다.
 */
export function shouldCaptureSheetDrag({
  dx,
  dy,
  startY,
  sheetTop,
  isExpanded,
  isCaptionOpen,
}: SheetDragInput) {
  if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx) * 1.5) {
    return false;
  }
  if (isExpanded) {
    return dy > 0 && startY < sheetTop + SHEET_DRAG_AREA_HEIGHT;
  }
  if (dy >= 0) {
    return false;
  }
  return !isCaptionOpen || startY >= sheetTop;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatSharedDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day}`;
}

type PlacesState =
  | {status: 'loading'}
  | {status: 'error'}
  | {status: 'ready'; places: HistoryReelPlace[]};

/** 공유한 게시물 하나의 상세. 원본 이미지 위에 캡션을, 아래 시트에 찾은 장소를 보여 줍니다. */
export function ReelDetailScreen({reel, onBack}: ReelDetailScreenProps) {
  const analytics = useScreenAnalytics('reel_detail');
  const insets = useSafeAreaInsets();
  const {height: windowHeight} = useWindowDimensions();
  const collapsedTop = Math.round(windowHeight * COLLAPSED_RATIO);
  const expandedTop = Math.round(windowHeight * EXPANDED_RATIO);

  const [placesState, setPlacesState] = useState<PlacesState>({
    status: 'loading',
  });
  const [isCaptionOpen, setIsCaptionOpen] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);

  const caption = normalizeReelCaption(reel.instagram_description);
  const author = reel.instagram_author_username
    ? `@${reel.instagram_author_username}`
    : null;
  const sharedDate = formatSharedDate(reel.created_at);
  const thumbnail = reel.local_thumbnail_source
    ? reel.local_thumbnail_source
    : reel.instagram_thumbnail_url
      ? {uri: reel.instagram_thumbnail_url}
      : null;

  useEffect(() => {
    let isMounted = true;
    setPlacesState({status: 'loading'});
    getHistoryReelDetail(reel)
      .then(detail => {
        if (!isMounted) {
          return;
        }
        setPlacesState({
          status: 'ready',
          places: detail.extraction?.extraction_places ?? [],
        });
      })
      .catch(() => {
        if (isMounted) {
          setPlacesState({status: 'error'});
        }
      });
    return () => {
      isMounted = false;
    };
  }, [reel]);

  // 시트 위쪽 y 위치(접힘 collapsedTop ↔ 끌어올림 expandedTop). 오버레이 위치도 이 값에서 계산합니다.
  const sheetTop = useRef(new Animated.Value(collapsedTop)).current;
  const layoutRef = useRef({collapsedTop, expandedTop});
  layoutRef.current = {collapsedTop, expandedTop};
  const dragStartTopRef = useRef(collapsedTop);

  const snapSheet = useCallback(
    (expanded: boolean) => {
      const target = expanded ? expandedTop : collapsedTop;
      setIsSheetExpanded(expanded);
      if (expanded) {
        setIsCaptionOpen(false);
      }
      Animated.spring(sheetTop, {
        toValue: target,
        bounciness: 0,
        speed: 18,
        useNativeDriver: false,
      }).start();
    },
    [collapsedTop, expandedTop, sheetTop],
  );
  const snapSheetRef = useRef(snapSheet);
  snapSheetRef.current = snapSheet;
  const isSheetExpandedRef = useRef(isSheetExpanded);
  isSheetExpandedRef.current = isSheetExpanded;

  const isCaptionOpenRef = useRef(isCaptionOpen);
  isCaptionOpenRef.current = isCaptionOpen;
  const sheetTopRef = useRef(collapsedTop);
  useEffect(() => {
    const id = sheetTop.addListener(({value}) => {
      sheetTopRef.current = value;
    });
    return () => sheetTop.removeListener(id);
  }, [sheetTop]);

  // 화면 전체에서 세로 끌기를 받아 시트를 움직입니다(탭은 자식 버튼이 그대로 받습니다).
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          shouldCaptureSheetDrag({
            dx: gesture.dx,
            dy: gesture.dy,
            startY: gesture.y0,
            sheetTop: sheetTopRef.current,
            isExpanded: isSheetExpandedRef.current,
            isCaptionOpen: isCaptionOpenRef.current,
          }),
        onPanResponderGrant: () => {
          sheetTop.stopAnimation(value => {
            dragStartTopRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          const {collapsedTop: low, expandedTop: high} = layoutRef.current;
          sheetTop.setValue(clamp(dragStartTopRef.current + gesture.dy, high, low));
        },
        onPanResponderRelease: (_, gesture) => {
          const {collapsedTop: low, expandedTop: high} = layoutRef.current;
          const current = clamp(dragStartTopRef.current + gesture.dy, high, low);
          const shouldExpand =
            gesture.vy < -0.3 ||
            (Math.abs(gesture.vy) <= 0.3 && current < (low + high) / 2);
          snapSheetRef.current(shouldExpand);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [sheetTop],
  );

  const openOriginal = useCallback(() => {
    analytics.button('open_original');
    if (reel.instagram_url) {
      Linking.openURL(reel.instagram_url).catch(() => undefined);
    }
  }, [analytics, reel.instagram_url]);

  const toggleCaption = useCallback(
    (open: boolean) => {
      analytics.button(open ? 'caption_open' : 'caption_close');
      setIsCaptionOpen(open);
    },
    [analytics],
  );

  // 시트를 끌어올릴수록 캡션은 사라집니다.
  const captionOpacity = sheetTop.interpolate({
    inputRange: [expandedTop, collapsedTop],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // 캡션이 펼쳐진 동안은 접힌 캡션이 어두운 막 뒤로 비쳐 겹쳐 보이지 않게 숨깁니다.
  const infoOpacity = isCaptionOpen ? 0 : captionOpacity;
  const overlayBottom = Animated.subtract(windowHeight, sheetTop);
  const sheetTranslateY = Animated.subtract(sheetTop, expandedTop);
  const sheetHeight = windowHeight - expandedTop;

  const placesCount =
    placesState.status === 'ready' ? placesState.places.length : 0;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {thumbnail ? (
        <Image source={thumbnail} style={styles.backdrop} />
      ) : (
        <LinearGradient
          colors={['#b9c2ff', '#e6e9ff']}
          end={{x: 1, y: 1}}
          start={{x: 0, y: 0}}
          style={styles.backdrop}
        />
      )}
      <LinearGradient
        colors={['rgba(0, 0, 0, 0)', 'rgba(13, 13, 31, 0.62)']}
        pointerEvents="none"
        style={[styles.shade, {top: windowHeight * 0.355, height: windowHeight * 0.355}]}
      />

      {/* 이미지 영역을 누르면 원본 게시물로 넘어갑니다. 시트나 캡션이 펼쳐진 동안은 받지 않습니다. */}
      <Pressable
        accessibilityLabel="원본 게시물 열기"
        accessibilityRole="button"
        disabled={isSheetExpanded || isCaptionOpen}
        onPress={openOriginal}
        style={styles.imageTapArea}
      />

      <Animated.View
        pointerEvents={isSheetExpanded || isCaptionOpen ? 'none' : 'box-none'}
        style={[
          styles.infoWrap,
          {bottom: overlayBottom, opacity: infoOpacity},
        ]}>
        {author ? <Text style={styles.author}>{author}</Text> : null}
        {caption ? (
          // 접힌 캡션 글을 누르면 전체 캡션이 펼쳐집니다.
          <Pressable
            accessibilityLabel="캡션 펼치기"
            accessibilityRole="button"
            onPress={() => toggleCaption(true)}>
            <Text numberOfLines={COLLAPSED_CAPTION_LINES} style={styles.caption}>
              {caption}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>

      {isCaptionOpen ? (
        <View style={styles.scrim}>
          <ScrollView
            contentContainerStyle={styles.captionContent}
            showsVerticalScrollIndicator={false}
            style={[
              styles.captionScroll,
              {
                top: insets.top + 64,
                bottom: windowHeight - collapsedTop + FOLD_BAR_HEIGHT + 16,
              },
            ]}>
            <Text style={styles.captionMeta}>
              {[author, sharedDate ? `${sharedDate} 공유` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={styles.captionFull}>{caption}</Text>
          </ScrollView>
          {/* 스크롤 영역 밖에 고정해 긴 캡션에서도 항상 보이고 바로 눌립니다. */}
          <Pressable
            accessibilityLabel="캡션 접기"
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => toggleCaption(false)}
            style={[
              styles.foldButton,
              {bottom: windowHeight - collapsedTop + 8},
            ]}>
            <Text style={styles.moreText}>접기</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.topBar, {top: insets.top + 4}]}>
        <Pressable
          accessibilityLabel="이전 화면으로 돌아가기"
          accessibilityRole="button"
          onPress={() => {
            analytics.button('back');
            onBack();
          }}
          style={styles.backButton}>
          <MaterialIcons color="#1a1a2e" name="chevron-left" size={28} />
        </Pressable>
        {reel.instagram_url ? (
          <Pressable
            accessibilityLabel="원본 게시물 보기"
            accessibilityRole="button"
            onPress={openOriginal}
            style={styles.originalButton}>
            <Image
              source={require('../../assets/icons/instagram-logo.png')}
              style={styles.originalIcon}
            />
            <Text style={styles.originalText}>원본</Text>
            <MaterialIcons color="#1a1a2e" name="north-east" size={13} />
          </Pressable>
        ) : null}
      </View>

      <Animated.View
        style={[
          styles.sheet,
          {
            top: expandedTop,
            height: sheetHeight,
            transform: [{translateY: sheetTranslateY}],
          },
        ]}>
        <Pressable
          accessibilityLabel={isSheetExpanded ? '찾은 장소 접기' : '찾은 장소 펼치기'}
          accessibilityRole="button"
          onPress={() => snapSheet(!isSheetExpanded)}
          style={styles.sheetDragArea}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>찾은 장소</Text>
            {placesState.status === 'ready' ? (
              <Text style={styles.sheetCount}>{placesCount}</Text>
            ) : null}
          </View>
        </Pressable>
        <ScrollView
          contentContainerStyle={[
            styles.sheetContent,
            {paddingBottom: insets.bottom + 24},
          ]}
          scrollEnabled={isSheetExpanded}
          showsVerticalScrollIndicator={false}>
          {placesState.status === 'loading' ? (
            <Text style={styles.stateText}>장소를 불러오고 있어요.</Text>
          ) : placesState.status === 'error' ? (
            <Text style={styles.stateText}>장소를 불러오지 못했어요.</Text>
          ) : placesState.places.length === 0 ? (
            <Text style={styles.stateText}>
              {reel.processing_status === 'COMPLETED'
                ? '찾은 장소가 없어요.'
                : reel.processing_status === 'FAILED'
                  ? '장소를 찾지 못했어요.'
                  : '장소를 찾고 있어요.'}
            </Text>
          ) : (
            placesState.places.map(item => {
              const place = item.place;
              if (!place) {
                return null;
              }
              const category = getMiddleCategory(place.category);
              return (
                <View key={item.id} style={styles.row}>
                  {place.thumbnail_url ? (
                    <Image
                      source={{uri: place.thumbnail_url}}
                      style={styles.photo}
                    />
                  ) : (
                    <View style={[styles.photo, styles.photoPlaceholder]} />
                  )}
                  <View style={styles.rowText}>
                    <View style={styles.nameRow}>
                      <Text numberOfLines={1} style={styles.name}>
                        {place.name}
                      </Text>
                      {category ? (
                        <View style={styles.categoryPill}>
                          <Text style={styles.category}>{category}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.address}>
                      {place.road_address ?? place.address ?? ''}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  imageTapArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  infoWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    gap: 6,
    paddingBottom: 18,
  },
  author: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
  },
  // 펼친 캡션(captionFull)과 같은 글자 크기·줄간격입니다.
  caption: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '700',
  },
  foldButton: {
    position: 'absolute',
    left: 20,
    height: FOLD_BAR_HEIGHT,
    justifyContent: 'center',
    paddingRight: 24,
  },
  moreText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    opacity: 0.85,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13, 13, 31, 0.72)',
  },
  captionScroll: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
  captionContent: {
    gap: 14,
  },
  captionMeta: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
  },
  captionFull: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 26,
  },
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  originalButton: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  originalIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  originalText: {
    color: '#1a1a2e',
    fontSize: 13,
    fontWeight: '700',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowOffset: {width: 0, height: -4},
    shadowRadius: 16,
    elevation: 12,
  },
  sheetDragArea: {
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
    backgroundColor: '#e4e6f5',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sheetTitle: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetCount: {
    color: '#5c6fc8',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetContent: {
    paddingHorizontal: 20,
  },
  stateText: {
    paddingVertical: 24,
    color: '#8e8e93',
    fontSize: 14,
    textAlign: 'center',
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 12,
  },
  photo: {
    width: PHOTO_WIDTH,
    height: PHOTO_HEIGHT,
    borderRadius: 4,
    resizeMode: 'cover',
  },
  photoPlaceholder: {
    backgroundColor: '#F1F3FB',
  },
  rowText: {
    flex: 1,
    gap: 7,
    paddingTop: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flexShrink: 1,
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '700',
  },
  categoryPill: {
    borderWidth: 1.5,
    borderColor: '#c9c9ce',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  category: {
    color: '#77777d',
    fontSize: 12,
  },
  address: {
    color: '#8e8e93',
    fontSize: 12,
    lineHeight: 18,
  },
});
