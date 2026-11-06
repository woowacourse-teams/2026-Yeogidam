import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  type ImageSourcePropType,
  Platform,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { useStepAnalytics } from '../analytics/uiEvents';

export type StepMediaFrame = {
  width: number;
  height: number;
};

export type StepPage = {
  key: string;
  eyebrow?: string;
  title: string;
  posterSource?: ImageSourcePropType;
  renderMedia: (frame: StepMediaFrame, onLoad?: () => void) => React.ReactNode;
};

type StepPagerProps = {
  /** 단계 이벤트에 붙는 흐름 이름입니다. 예: `onboarding`, `app_guide` */
  flowName: string;
  pages: StepPage[];
  onComplete: () => void;
  /** 두 번째 페이지부터 이전 버튼을 보여준다. */
  showPrevious?: boolean;
  lastButtonLabel?: string;
  lastButtonAccessibilityLabel?: string;
  backRequest?: number;
  onBackAtFirst?: () => void;
};

// 데모 영상 비율(300x500)에 맞춘 프레임
const MEDIA_RATIO = 500 / 300;
// 영상의 둥근 모서리 바깥은 검은색이라, 영상 모서리(폭의 약 13%)보다 살짝 크게 잘라 가린다.
const MEDIA_CORNER_RATIO = 0.145;
const MEDIA_BOTTOM_GAP = 16;
const SWIPE_MIN_DISTANCE = 50;
const SWIPE_HORIZONTAL_RATIO = 1.3;

// 실제 영상 영역의 높이에 맞춰 데모 프레임 크기를 정한다.
function useMediaFrame(mediaAreaHeight: number) {
  const { width } = useWindowDimensions();
  const maxWidth = Math.min(width - 96, 320);
  const maxHeight = Math.max(0, mediaAreaHeight - MEDIA_BOTTOM_GAP - 2);
  const frameWidth = Math.round(
    Math.max(0, Math.min(maxWidth, maxHeight / MEDIA_RATIO)),
  );

  return {
    frameWidth,
    frameHeight: Math.round(frameWidth * MEDIA_RATIO),
    frameRadius: Math.round(frameWidth * MEDIA_CORNER_RATIO),
  };
}

function PageDots({ count, current }: { count: number; current: number }) {
  return (
    <View
      accessible
      accessibilityLabel={`${count}페이지 중 ${current + 1}페이지`}
      style={styles.dots}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[styles.dot, index === current && styles.dotActive]}
        />
      ))}
    </View>
  );
}

function PageMedia({
  page,
  frame,
  active,
}: {
  page: StepPage;
  frame: StepMediaFrame;
  active: boolean;
}) {
  const [ready, setReady] = useState(false);
  const fadeOpacity = useRef(new Animated.Value(0)).current;
  const loadVersion = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!active) {
      loadVersion.current += 1;
      setReady(false);
      fadeOpacity.stopAnimation();
      fadeOpacity.setValue(0);
    }
  }, [active, fadeOpacity]);

  // GIF 페이지는 이동 중 첫 프레임을 유지하고, 도착할 때마다 GIF를 새로 시작한다.
  const androidGif = Platform.OS === 'android' && !!page.posterSource;
  // Android는 onLoad 직후 GIF가 그려지기 전에도 포스터를 뒤에 남겨 둔다.
  const showPoster = !!page.posterSource && (androidGif || !active || !ready);
  const fadeStyle = androidGif ? {opacity: fadeOpacity} : undefined;
  const currentLoadVersion = loadVersion.current;
  return (
    <View style={frame}>
      {showPoster ? (
        <Image
          source={page.posterSource}
          accessible={false}
          resizeMode="cover"
          style={frame}
        />
      ) : null}
      {!page.posterSource || active ? (
        <Animated.View
          testID="step-media-gif-layer"
          style={[
            styles.mediaLayer,
            frame,
            fadeStyle,
            !androidGif && showPoster && styles.mediaLoading,
          ]}
        >
          {page.renderMedia(
            frame,
            page.posterSource
              ? () => {
                  if (
                    activeRef.current &&
                    loadVersion.current === currentLoadVersion
                  ) {
                    setReady(true);
                    if (androidGif) {
                      Animated.timing(fadeOpacity, {
                        toValue: 1,
                        duration: 180,
                        useNativeDriver: true,
                      }).start();
                    }
                  }
                }
              : undefined,
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

// 점 표시, 제목, 데모 프레임, 하단 버튼으로 이뤄진 단계별 안내 화면
export function StepPager({
  flowName,
  pages,
  onComplete,
  showPrevious = false,
  lastButtonLabel = '다음',
  lastButtonAccessibilityLabel,
  backRequest = 0,
  onBackAtFirst,
}: StepPagerProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const {button, stepViewed} = useStepAnalytics(flowName, pages.length);
  const [mediaAreaHeight, setMediaAreaHeight] = useState(0);
  const touchStart = useRef<{pageX: number; pageY: number} | null>(null);
  const translation = useRef(new Animated.Value(0)).current;
  const isTransitioning = useRef(false);
  const pendingBack = useRef(false);
  const lastBackRequest = useRef(backRequest);
  const backAction = useRef<() => void>(() => undefined);
  const {width: screenWidth} = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(Math.max(0, screenWidth - 48));
  const { frameWidth, frameHeight, frameRadius } = useMediaFrame(mediaAreaHeight);
  const isLast = pageIndex === pages.length - 1;
  const nextLabel = isLast ? lastButtonLabel : '다음';

  useEffect(() => {
    stepViewed(pageIndex);
  }, [pageIndex, stepViewed]);

  useEffect(() => {
    if (!pendingBack.current || isTransitioning.current) return;
    pendingBack.current = false;
    backAction.current();
  }, [pageIndex]);

  const resetTranslation = () => {
    Animated.spring(translation, {
      toValue: -pageIndex * pageWidth,
      speed: 22,
      bounciness: 3,
      useNativeDriver: true,
    }).start();
  };

  const changePage = (direction: number) => {
    if (isTransitioning.current) return;
    const nextIndex = pageIndex + direction;
    if (nextIndex < 0 || nextIndex >= pages.length) {
      resetTranslation();
      return;
    }

    isTransitioning.current = true;
    Animated.timing(translation, {
      toValue: -nextIndex * pageWidth,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({finished}) => {
      isTransitioning.current = false;
      if (!finished) {
        resetTranslation();
        return;
      }
      setPageIndex(nextIndex);
    });
  };

  backAction.current = () => {
    if (isTransitioning.current) {
      pendingBack.current = true;
      return;
    }
    if (pageIndex === 0) onBackAtFirst?.();
    else changePage(-1);
  };

  useEffect(() => {
    if (lastBackRequest.current === backRequest) return;
    lastBackRequest.current = backRequest;
    backAction.current();
  }, [backRequest]);

  const handleNext = () => {
    if (isTransitioning.current) return;
    button(isLast ? 'complete' : 'next', pageIndex);
    if (isLast) {
      onComplete();
      return;
    }
    changePage(1);
  };

  const handleMediaAreaLayout = (event: LayoutChangeEvent) => {
    setMediaAreaHeight(event.nativeEvent.layout.height);
  };

  const handlePageViewportLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width <= 0 || width === pageWidth) return;
    setPageWidth(width);
    translation.setValue(-pageIndex * width);
  };

  const handleTouchStart = (event: GestureResponderEvent) => {
    if (isTransitioning.current) return;
    touchStart.current =
      event.nativeEvent.touches.length === 1
        ? {pageX: event.nativeEvent.pageX, pageY: event.nativeEvent.pageY}
        : null;
  };

  const handleTouchMove = (event: GestureResponderEvent) => {
    const start = touchStart.current;
    if (!start || isTransitioning.current) return;
    const dx = event.nativeEvent.pageX - start.pageX;
    const dy = event.nativeEvent.pageY - start.pageY;
    if (Math.abs(dx) <= Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) return;
    translation.setValue(
      -pageIndex * pageWidth +
        Math.max(-pageWidth * 0.55, Math.min(pageWidth * 0.55, dx)),
    );
  };

  const handleTouchEnd = (event: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || isTransitioning.current) return;

    const dx = event.nativeEvent.pageX - start.pageX;
    const dy = event.nativeEvent.pageY - start.pageY;
    if (
      Math.abs(dx) < SWIPE_MIN_DISTANCE ||
      Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO
    ) {
      resetTranslation();
      return;
    }

    // 완료는 마지막 페이지의 버튼으로만 확정한다.
    changePage(dx < 0 ? 1 : -1);
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.content}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
          resetTranslation();
        }}
      >
        <PageDots count={pages.length} current={pageIndex} />

        <View
          testID="step-page-viewport"
          onLayout={handlePageViewportLayout}
          style={styles.pageViewport}
        >
          <Animated.View
            style={[
              styles.pageTrack,
              {
                width: pageWidth * pages.length,
                transform: [{translateX: translation}],
              },
            ]}
          >
            {pages.map((stepPage, index) => (
              <View
                key={stepPage.key}
                testID={`step-page-${index}`}
                accessibilityElementsHidden={index !== pageIndex}
                importantForAccessibility={
                  index === pageIndex ? 'auto' : 'no-hide-descendants'
                }
                pointerEvents={index === pageIndex ? 'auto' : 'none'}
                style={[styles.pageContent, {width: pageWidth}]}
              >
                <View style={styles.header}>
                  {stepPage.eyebrow ? (
                    <Text style={styles.eyebrow}>{stepPage.eyebrow}</Text>
                  ) : null}
                  <Text accessibilityRole="header" style={styles.title}>
                    {stepPage.title}
                  </Text>
                </View>

                <View
                  testID="step-media-area"
                  style={styles.mediaArea}
                  onLayout={handleMediaAreaLayout}
                >
                  {frameWidth > 0 ? (
                    <View
                      style={[
                        styles.frame,
                        {
                          width: frameWidth + 2,
                          borderTopLeftRadius: frameRadius,
                          borderTopRightRadius: frameRadius,
                        },
                      ]}
                    >
                      <PageMedia
                        page={stepPage}
                        active={index === pageIndex}
                        frame={{width: frameWidth, height: frameHeight}}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </Animated.View>
        </View>
      </View>

      <View style={styles.footer}>
        {showPrevious && pageIndex > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전"
            onPress={() => {
              button('previous', pageIndex);
              changePage(-1);
            }}
            style={({ pressed }) => [
              styles.button,
              styles.secondaryButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>이전</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isLast ? lastButtonAccessibilityLabel ?? nextLabel : nextLabel
          }
          onPress={handleNext}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>{nextLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  pageContent: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  pageViewport: {
    flex: 1,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  pageTrack: {
    flex: 1,
    flexDirection: 'row',
  },
  dots: {
    flexDirection: 'row',
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#d9dbe1',
  },
  dotActive: {
    backgroundColor: '#4f6ef7',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    minHeight: 112,
    marginTop: 24,
    marginBottom: 32,
  },
  eyebrow: {
    color: '#4f6ef7',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  title: {
    color: '#141c2d',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 32,
    textAlign: 'center',
  },
  frame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e1e3e8',
    backgroundColor: '#ffffff',
  },
  mediaLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  mediaLoading: {
    opacity: 0,
  },
  mediaArea: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: MEDIA_BOTTOM_GAP,
  },
  footer: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 28,
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 40,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: '#b7c3f9',
    shadowColor: '#4f6ef7',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#b7c3f9',
    backgroundColor: '#ffffff',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#141c2d',
    fontSize: 18,
    fontWeight: '800',
  },
});
