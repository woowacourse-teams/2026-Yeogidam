import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

export type StepMediaFrame = {
  width: number;
  height: number;
};

export type StepPage = {
  key: string;
  eyebrow?: string;
  title: string;
  renderMedia: (frame: StepMediaFrame) => React.ReactNode;
};

type StepPagerProps = {
  pages: StepPage[];
  onComplete: () => void;
  /** 두 번째 페이지부터 이전 버튼을 보여준다. */
  showPrevious?: boolean;
  lastButtonLabel?: string;
  lastButtonAccessibilityLabel?: string;
};

// 데모 영상 비율(300x500)에 맞춘 프레임
const MEDIA_RATIO = 500 / 300;
// 영상의 둥근 모서리 바깥은 검은색이라, 영상 모서리(폭의 약 13%)보다 살짝 크게 잘라 가린다.
const MEDIA_CORNER_RATIO = 0.145;

// 화면 높이에 맞춰 데모 프레임 크기를 정한다.
function useMediaFrame() {
  const { width, height } = useWindowDimensions();
  const maxWidth = Math.min(width - 96, 320);
  const maxHeight = Math.max(280, height - 380);
  const frameWidth = Math.round(Math.min(maxWidth, maxHeight / MEDIA_RATIO));

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

// 점 표시, 제목, 데모 프레임, 하단 버튼으로 이뤄진 단계별 안내 화면
export function StepPager({
  pages,
  onComplete,
  showPrevious = false,
  lastButtonLabel = '다음',
  lastButtonAccessibilityLabel,
}: StepPagerProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const { frameWidth, frameHeight, frameRadius } = useMediaFrame();
  const page = pages[pageIndex];
  const isLast = pageIndex === pages.length - 1;
  const nextLabel = isLast ? lastButtonLabel : '다음';

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setPageIndex(prev => prev + 1);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <PageDots count={pages.length} current={pageIndex} />

        <View style={styles.header}>
          {page.eyebrow ? (
            <Text style={styles.eyebrow}>{page.eyebrow}</Text>
          ) : null}
          <Text accessibilityRole="header" style={styles.title}>
            {page.title}
          </Text>
        </View>

        <View
          key={page.key}
          style={[
            styles.frame,
            {
              width: frameWidth + 2,
              borderTopLeftRadius: frameRadius,
              borderTopRightRadius: frameRadius,
            },
          ]}
        >
          {page.renderMedia({ width: frameWidth, height: frameHeight })}
        </View>
      </View>

      <View style={styles.footer}>
        {showPrevious && pageIndex > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이전"
            onPress={() => setPageIndex(prev => prev - 1)}
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
  footer: {
    flexDirection: 'row',
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
