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
  Platform,
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
import {getHistoryReelDetail, reportHistoryReel} from '../../entities/content/history-api';
import {saveMediaPlace} from '../../entities/content/saved-media-api';
import {deleteSavedPlaces} from '../../entities/info/api';
import {showAlert} from '../../lib/app-alert';
import {historyReelPlaceToPlace} from '../../entities/content/convert';
import {normalizeReelCaption} from '../../entities/content/title';
import type {Place} from '../../entities/place/types';
import type {
  HistoryReel,
  HistoryReelPlace,
} from '../../entities/content/types';
import {getMiddleCategory} from '../../entities/place/category';

type ReelDetailScreenProps = {
  reel: HistoryReel;
  onBack: () => void;
  onReported?: (reelId: string) => void;
  /** 지정하면 '찾은 장소' 항목을 눌렀을 때 해당 장소 상세로 이동합니다. */
  onOpenPlace?: (place: Place) => void;
  isGuest?: boolean;
};

const COLLAPSED_RATIO = 600 / 844;
const EXPANDED_RATIO = 250 / 844;
const SHEET_RADIUS = 28;
const PHOTO_WIDTH = 100;
const PHOTO_HEIGHT = 92;
const ROW_HEIGHT = 116;
const COLLAPSED_CAPTION_LINES = 2;
const CAPTION_SCRIM_COLOR = 'rgba(13, 13, 31, 0.72)';
const CAPTION_SHADE_SOLID_START = 0.6;
const CAPTION_TRANSITION_DURATION_MS = 200;
// 둘째 줄이 줄바꿈으로 끝나면 기본 말줄임이 붙지 않아 직접 붙입니다.
const CAPTION_ELLIPSIS = '...';
// 말줄임이 차지하는 폭보다 조금 넉넉하게 잡아 다음 줄로 밀리지 않게 합니다.
const CAPTION_ELLIPSIS_WIDTH = 24;
const CAPTION_SIDE_PADDING = 20;
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
  /** 펼친 캡션 스크롤 위치. 0 이하(맨 위)일 때만 아래로 끌어 캡션을 닫습니다. */
  captionScrollY?: number;
};

// 펼친 캡션을 아래로 끌어 닫을 최소 거리/속도.
const CAPTION_DISMISS_DISTANCE = 80;
const CAPTION_DISMISS_VELOCITY = 0.3;
const CAPTION_DISMISS_PULL = 60;

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
  captionScrollY,
}: SheetDragInput) {
  if (Math.abs(dy) < 6 || Math.abs(dy) < Math.abs(dx) * 1.5) {
    return false;
  }
  if (isCaptionOpen && !isExpanded && dy > 0) {
    // 캡션 맨 위에서 아래로 끌면 캡션을 닫는 제스처로 받습니다.
    return (
      captionScrollY !== undefined && captionScrollY <= 0 && startY < sheetTop
    );
  }
  if (isExpanded) {
    return dy > 0 && startY < sheetTop + SHEET_DRAG_AREA_HEIGHT;
  }
  if (dy >= 0) {
    return false;
  }
  return !isCaptionOpen || startY >= sheetTop;
}

/**
 * 펼친 캡션 스크롤을 놓았을 때 아래로 당겨 닫을지 정합니다. 캡션 스크롤이 네이티브 터치를 가져가면
 * 시트 제스처(PanResponder)가 취소되므로, 스크롤이 주는 끌기 종료 이벤트로 판단합니다.
 * - iOS: 맨 위에서 당기면 오프셋이 음수가 됩니다(바운스).
 * - Android: 오프셋이 0에 머물고, 아래로 끈 손가락 속도가 양수로 옵니다.
 */
/**
 * 잘리는 캡션을 말줄임이 들어갈 만큼만 남깁니다. 접힌 줄 수 안에 다 들어가면 null입니다.
 */
export function getCollapsedCaptionPreview(
  lines: {text: string; width: number}[],
  maxWidth: number,
) {
  if (lines.length <= COLLAPSED_CAPTION_LINES) {
    return null;
  }

  const visibleLines = lines.slice(0, COLLAPSED_CAPTION_LINES);
  const lastLine = visibleLines[visibleLines.length - 1];
  // 이모지가 반쪽으로 잘리지 않도록 글자 단위로 나눕니다.
  const lastCharacters = Array.from(lastLine.text.trimEnd());
  const overflow = lastLine.width + CAPTION_ELLIPSIS_WIDTH - maxWidth;
  const removeCount =
    overflow > 0 && lastLine.width > 0
      ? Math.ceil((lastCharacters.length * overflow) / lastLine.width)
      : 0;

  // 끝이 빈 줄이어도 말줄임이 마지막 글자에 바로 이어지도록 끝의 공백과 줄바꿈을 지웁니다.
  return [
    ...visibleLines.slice(0, -1).map(line => line.text),
    lastCharacters
      .slice(0, Math.max(0, lastCharacters.length - removeCount))
      .join(''),
  ]
    .join('')
    .trimEnd();
}

export function shouldDismissCaptionOnDragEnd({
  offsetY,
  velocityY,
  platform,
}: {
  offsetY: number;
  velocityY: number;
  platform: string;
}) {
  if (platform === 'ios') {
    return offsetY <= -CAPTION_DISMISS_PULL;
  }
  return offsetY <= 0 && velocityY >= CAPTION_DISMISS_VELOCITY;
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
export function ReelDetailScreen({reel, onBack, onReported, onOpenPlace, isGuest = false}: ReelDetailScreenProps) {
  const analytics = useScreenAnalytics('reel_detail');
  const insets = useSafeAreaInsets();
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const collapsedTop = Math.round(windowHeight * COLLAPSED_RATIO);
  const expandedTop = Math.round(windowHeight * EXPANDED_RATIO);

  const [placesState, setPlacesState] = useState<PlacesState>({
    status: 'loading',
  });
  const [isCaptionOpen, setIsCaptionOpen] = useState(false);
  const [isSheetExpanded, setIsSheetExpanded] = useState(false);
  const [savingPlaceIds, setSavingPlaceIds] = useState<Set<string>>(new Set());
  const [isReported, setIsReported] = useState(reel.reported === true);
  const [isReporting, setIsReporting] = useState(false);

  useEffect(() => {
    setIsReported(reel.reported === true);
  }, [reel.id, reel.reported]);

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

  const toggleSavedPlace = useCallback(async (item: HistoryReelPlace) => {
    const placeId = item.place?.id;
    if (!placeId || savingPlaceIds.has(placeId)) return;
    setSavingPlaceIds(current => new Set(current).add(placeId));
    try {
      let savedPlaceId: string | null;
      if (item.savedPlaceId) {
        await deleteSavedPlaces([item.savedPlaceId]);
        savedPlaceId = null;
      } else {
        savedPlaceId = await saveMediaPlace(reel.id, placeId);
      }
      setPlacesState(current => current.status !== 'ready' ? current : {
        ...current,
        places: current.places.map(place => place.place?.id === placeId
          ? {...place, savedPlaceId}
          : place),
      });
    } catch (error) {
      showAlert('장소를 저장하지 못했어요.', (error as {message?: string}).message);
    } finally {
      setSavingPlaceIds(current => {
        const next = new Set(current);
        next.delete(placeId);
        return next;
      });
    }
  }, [reel.id, savingPlaceIds]);

  const confirmReport = useCallback(() => {
    if (isReported || isReporting) return;
    showAlert('제보할까요?', '', [
      {text: '취소', style: 'cancel'},
      {
        text: '확인',
        onPress: () => {
          setIsReporting(true);
          reportHistoryReel(reel.id)
            .then(() => {
              setIsReported(true);
              onReported?.(reel.id);
            })
            .catch(() => showAlert('제보하지 못했어요.', '잠시 후 다시 시도해주세요.'))
            .finally(() => setIsReporting(false));
        },
      },
    ]);
  }, [isReported, isReporting, onReported, reel.id]);

  // 시트 위쪽 y 위치(접힘 collapsedTop ↔ 끌어올림 expandedTop). 오버레이 위치도 이 값에서 계산합니다.
  const sheetTop = useRef(new Animated.Value(collapsedTop)).current;
  const layoutRef = useRef({collapsedTop, expandedTop});
  layoutRef.current = {collapsedTop, expandedTop};
  const dragStartTopRef = useRef(collapsedTop);
  // 접히는 동안에도 페이드가 보이도록 애니메이션이 끝날 때까지 펼친 캡션을 유지합니다.
  const [isCaptionRendered, setIsCaptionRendered] = useState(false);
  const captionProgress = useRef(new Animated.Value(0)).current;
  const [captionPreview, setCaptionPreview] = useState<string | null>(null);

  useEffect(() => {
    if (isCaptionOpen) {
      setIsCaptionRendered(true);
    }
    // sheetTop과 함께 접힌 캡션의 투명도를 계산하므로 같은 JS 드라이버를 씁니다.
    Animated.timing(captionProgress, {
      toValue: isCaptionOpen ? 1 : 0,
      duration: CAPTION_TRANSITION_DURATION_MS,
      useNativeDriver: false,
    }).start(({finished}) => {
      if (finished && !isCaptionOpen) {
        setIsCaptionRendered(false);
      }
    });
  }, [captionProgress, isCaptionOpen]);

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
  const captionScrollYRef = useRef(0);
  // 이번 끌기가 캡션 닫기 제스처인지(시트 제스처와 구분).
  const isCaptionDismissDragRef = useRef(false);
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
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          const captured = shouldCaptureSheetDrag({
            dx: gesture.dx,
            dy: gesture.dy,
            // y0은 제스처를 넘겨받은 뒤에야 채워져 이 시점엔 항상 0이므로, 현재 위치에서 이동 거리를 빼 시작 위치를 구합니다.
            startY: gesture.moveY - gesture.dy,
            sheetTop: sheetTopRef.current,
            isExpanded: isSheetExpandedRef.current,
            isCaptionOpen: isCaptionOpenRef.current,
            captionScrollY: captionScrollYRef.current,
          });
          isCaptionDismissDragRef.current =
            captured && isCaptionOpenRef.current && !isSheetExpandedRef.current && gesture.dy > 0;
          return captured;
        },
        onPanResponderGrant: () => {
          if (isCaptionDismissDragRef.current) {
            return;
          }
          sheetTop.stopAnimation(value => {
            dragStartTopRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          if (isCaptionDismissDragRef.current) {
            return;
          }
          const {collapsedTop: low, expandedTop: high} = layoutRef.current;
          sheetTop.setValue(clamp(dragStartTopRef.current + gesture.dy, high, low));
        },
        onPanResponderRelease: (_, gesture) => {
          if (isCaptionDismissDragRef.current) {
            isCaptionDismissDragRef.current = false;
            if (
              gesture.dy > CAPTION_DISMISS_DISTANCE ||
              gesture.vy > CAPTION_DISMISS_VELOCITY
            ) {
              toggleCaptionRef.current(false);
            }
            return;
          }
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
    if (!reel.instagram_url) return;
    const url = reel.instagram_url;
    showAlert('인스타그램에서 원본 게시물을 볼까요?', '인스타그램 앱 또는 웹사이트로 이동해요.', [
      {text: '취소', style: 'cancel'},
      {
        text: '열기',
        onPress: () => {
          analytics.button('open_original');
          Linking.openURL(url).catch(() => undefined);
        },
      },
    ]);
  }, [analytics, reel.instagram_url]);

  const toggleCaption = useCallback(
    (open: boolean) => {
      analytics.button(open ? 'caption_open' : 'caption_close');
      captionScrollYRef.current = 0;
      setIsCaptionOpen(open);
    },
    [analytics],
  );
  const toggleCaptionRef = useRef(toggleCaption);
  toggleCaptionRef.current = toggleCaption;

  // 시트를 끌어올릴수록 캡션은 사라집니다.
  const captionOpacity = sheetTop.interpolate({
    inputRange: [expandedTop, collapsedTop],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  // 캡션이 펼쳐진 동안은 접힌 캡션이 어두운 막 뒤로 비쳐 겹쳐 보이지 않게 숨깁니다.
  const infoOpacity = Animated.multiply(
    captionOpacity,
    captionProgress.interpolate({inputRange: [0, 1], outputRange: [1, 0]}),
  );
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
        // 접힌 캡션이 시작되는 높이부터 펼친 캡션의 배경과 같은 어둡기로 이어 글씨가 잘 보이게 하고,
        // 시트의 둥근 모서리 뒤로 밝은 원본 이미지가 비치지 않도록 시트 윗선 아래까지 덮습니다.
        colors={['rgba(0, 0, 0, 0)', CAPTION_SCRIM_COLOR, CAPTION_SCRIM_COLOR]}
        locations={[0, CAPTION_SHADE_SOLID_START, 1]}
        pointerEvents="none"
        style={[
          styles.shade,
          {
            top: windowHeight * 0.355,
            height: windowHeight * 0.355 + SHEET_RADIUS,
          },
        ]}
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
            {/* 전체 줄바꿈을 재기 위한 숨은 글자입니다. 화면 폭이 같아야 결과가 맞습니다. */}
            <Text
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              onTextLayout={event =>
                setCaptionPreview(
                  getCollapsedCaptionPreview(
                    event.nativeEvent.lines,
                    windowWidth - CAPTION_SIDE_PADDING * 2,
                  ),
                )
              }
              style={[styles.caption, styles.captionMeasure]}>
              {caption}
            </Text>
            <Text numberOfLines={COLLAPSED_CAPTION_LINES} style={styles.caption}>
              {captionPreview !== null
                ? `${captionPreview}${CAPTION_ELLIPSIS}`
                : caption}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>

      {isCaptionOpen || isCaptionRendered ? (
        <Animated.View
          pointerEvents={isCaptionOpen ? 'auto' : 'none'}
          style={[styles.scrim, {opacity: captionProgress}]}>
          <ScrollView
            contentContainerStyle={styles.captionContent}
            onScroll={e => {
              captionScrollYRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            onScrollEndDrag={e => {
              const {contentOffset, velocity} = e.nativeEvent;
              if (
                shouldDismissCaptionOnDragEnd({
                  offsetY: contentOffset.y,
                  velocityY: velocity?.y ?? 0,
                  platform: Platform.OS,
                })
              ) {
                toggleCaption(false);
              }
            }}
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
            <Text style={styles.caption}>{caption}</Text>
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
        </Animated.View>
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
        <View style={styles.topBarActions}>
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
                <Pressable
                  key={item.id}
                  accessibilityLabel={`${place.name} 장소 상세 보기`}
                  accessibilityRole="button"
                  disabled={!onOpenPlace}
                  onPress={() => {
                    const detailPlace = historyReelPlaceToPlace(item);
                    if (detailPlace) {
                      analytics.button('open_place_detail');
                      onOpenPlace?.(detailPlace);
                    }
                  }}
                  style={styles.row}>
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
                  {reel.processing_status === 'COMPLETED' && !isGuest ? (
                    <Pressable
                      accessibilityLabel={`${place.name} ${item.savedPlaceId ? '북마크 해제' : '북마크하기'}`}
                      accessibilityRole="button"
                      disabled={savingPlaceIds.has(place.id)}
                      onPress={() => toggleSavedPlace(item)}
                      style={styles.savePlaceButton}>
                      <MaterialIcons
                        color={item.savedPlaceId ? '#7186ed' : '#8b8e99'}
                        name={item.savedPlaceId ? 'bookmark' : 'bookmark-border'}
                        size={25}
                      />
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })
          )}
          {placesState.status === 'ready' && reel.processing_status === 'COMPLETED' && !isGuest ? (
            <View style={styles.reportSection}>
              <Text style={styles.reportHint}>장소가 빠졌거나 잘못 찾았나요?</Text>
              <Pressable
                accessibilityLabel={isReported ? '제보 완료' : '게시물 제보하기'}
                accessibilityRole="button"
                disabled={isReported || isReporting}
                onPress={confirmReport}
                style={styles.reportButton}>
                <MaterialIcons
                  color={isReported ? '#a5abc4' : '#5868ed'}
                  name="outlined-flag"
                  size={23}
                />
                <Text style={[styles.reportText, isReported && styles.reportTextDisabled]}>
                  {isReported ? '제보 완료' : '제보하기'}
                </Text>
              </Pressable>
            </View>
          ) : null}
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
  infoWrap: {
    position: 'absolute',
    left: CAPTION_SIDE_PADDING,
    right: CAPTION_SIDE_PADDING,
    gap: 6,
    paddingBottom: 18,
  },
  author: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
    opacity: 0.9,
  },
  caption: {
    color: '#ffffff',
    fontSize: 16,
    lineHeight: 26,
  },
  captionMeasure: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0,
  },
  foldButton: {
    position: 'absolute',
    right: 20,
    height: FOLD_BAR_HEIGHT,
    justifyContent: 'center',
    paddingLeft: 24,
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
    backgroundColor: CAPTION_SCRIM_COLOR,
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
  topBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  reportSection: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 52,
  },
  reportHint: {
    color: '#bcbcbc',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  reportButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
  },
  reportText: {
    color: '#5868ed',
    fontSize: 18,
    fontWeight: '700',
  },
  reportTextDisabled: {
    color: '#a5abc4',
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
  savePlaceButton: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
