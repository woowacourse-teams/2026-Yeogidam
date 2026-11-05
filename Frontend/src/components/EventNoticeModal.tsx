import React, { useCallback, useEffect, useState } from 'react';
import {
  AppState,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { KeyboardAvoidingModal } from './KeyboardAvoidingModal';
import {
  hasDismissedEventNotice,
  rememberDismissedEventNotice,
} from '../lib/event-notice-storage';

// 노출 기간은 KST 기준이며 endsAt 시각부터는 표시하지 않는다.
export const OPEN_EVENT_WINNER_NOTICE = {
  id: 'open-event-winner-2026-11',
  startsAt: new Date('2026-11-03T13:00:00+09:00'),
  endsAt: new Date('2026-11-10T13:00:00+09:00'),
  linkUrl: 'https://www.instagram.com/yeogidamm/',
};

type EventNoticeModalProps = {
  // 업데이트 안내처럼 먼저 보여야 하는 모달이 있으면 false로 미룬다.
  enabled: boolean;
  now?: () => Date;
};

const getCurrentDate = () => new Date();

const HERO_WIDTH = 220;
const HERO_HEIGHT = 140;

const CONFETTI_COLORS = {
  yellow: '#FFD43B',
  coral: '#FF6B5B',
  blue: '#5B63E8',
  mint: '#3FCFA0',
};

// 다미 일러스트(가운데 x 44~176)를 가리지 않도록 좌우 가장자리에만 배치한다.
const CONFETTI_PIECES = [
  { x: 14, y: 34, width: 11, rotate: -30, color: CONFETTI_COLORS.yellow },
  { x: 30, y: 96, width: 10, rotate: 40, color: CONFETTI_COLORS.coral },
  { x: 22, y: 126, width: 9, rotate: -15, color: CONFETTI_COLORS.mint },
  { x: 188, y: 26, width: 11, rotate: 25, color: CONFETTI_COLORS.mint },
  { x: 196, y: 84, width: 11, rotate: -35, color: CONFETTI_COLORS.yellow },
  { x: 180, y: 122, width: 9, rotate: 15, color: CONFETTI_COLORS.blue },
];

const CONFETTI_DOTS = [
  { cx: 12, cy: 66, r: 3.5, color: CONFETTI_COLORS.blue },
  { cx: 206, cy: 56, r: 3, color: CONFETTI_COLORS.coral },
  { cx: 202, cy: 132, r: 2.5, color: CONFETTI_COLORS.yellow },
];

const SPARKLES = [
  { x: 40, y: 18, size: 8, color: CONFETTI_COLORS.yellow },
  { x: 184, y: 56, size: 6, color: CONFETTI_COLORS.blue },
  { x: 10, y: 104, size: 5, color: CONFETTI_COLORS.coral },
  { x: 204, y: 108, size: 5, color: CONFETTI_COLORS.mint },
];

function sparklePath(x: number, y: number, size: number) {
  return `M${x},${y - size} Q${x},${y} ${x + size},${y} Q${x},${y} ${x},${y + size} Q${x},${y} ${x - size},${y} Q${x},${y} ${x},${y - size} Z`;
}

function CelebrationHero() {
  return (
    <View style={styles.hero}>
      <Svg
        height={HERO_HEIGHT}
        style={StyleSheet.absoluteFill}
        viewBox={`0 0 ${HERO_WIDTH} ${HERO_HEIGHT}`}
        width={HERO_WIDTH}
      >
        {CONFETTI_PIECES.map(piece => (
          <Rect
            fill={piece.color}
            height={4}
            key={`${piece.x}-${piece.y}`}
            rx={2}
            transform={`rotate(${piece.rotate} ${piece.x} ${piece.y})`}
            width={piece.width}
            x={piece.x - piece.width / 2}
            y={piece.y - 2}
          />
        ))}
        {CONFETTI_DOTS.map(dot => (
          <Circle
            cx={dot.cx}
            cy={dot.cy}
            fill={dot.color}
            key={`${dot.cx}-${dot.cy}`}
            r={dot.r}
          />
        ))}
        {SPARKLES.map(sparkle => (
          <Path
            d={sparklePath(sparkle.x, sparkle.y, sparkle.size)}
            fill={sparkle.color}
            key={`${sparkle.x}-${sparkle.y}`}
          />
        ))}
      </Svg>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={require('../assets/illustrations/dami-event-winner-cropped.png')}
        style={styles.illustration}
      />
    </View>
  );
}

function isWithinNoticePeriod(date: Date) {
  return (
    date >= OPEN_EVENT_WINNER_NOTICE.startsAt &&
    date < OPEN_EVENT_WINNER_NOTICE.endsAt
  );
}

export function EventNoticeModal({
  enabled,
  now = getCurrentDate,
}: EventNoticeModalProps) {
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null);
  const [isInPeriod, setIsInPeriod] = useState(() => isWithinNoticePeriod(now()));
  // 안드로이드 뒤로가기는 실수로 누를 수 있어 이번 실행에서만 숨기고 닫은 기록은 남기지 않는다.
  const [isHiddenForSession, setIsHiddenForSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    hasDismissedEventNotice(OPEN_EVENT_WINNER_NOTICE.id).then(dismissed => {
      if (!cancelled) setIsDismissed(dismissed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 앱을 켜 둔 채 시작·종료 시각을 넘길 수 있어 포그라운드로 돌아올 때 다시 확인한다.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setIsInPeriod(isWithinNoticePeriod(now()));
    });
    return () => subscription.remove();
  }, [now]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    rememberDismissedEventNotice(OPEN_EVENT_WINNER_NOTICE.id).catch(
      () => undefined,
    );
  }, []);

  const openLink = useCallback(() => {
    dismiss();
    Linking.openURL(OPEN_EVENT_WINNER_NOTICE.linkUrl).catch(error => {
      if (__DEV__) {
        console.warn('[EventNotice] Unable to open link.', error);
      }
    });
  }, [dismiss]);

  return (
    <KeyboardAvoidingModal
      animationType="fade"
      onRequestClose={() => setIsHiddenForSession(true)}
      statusBarTranslucent
      transparent
      visible={
        enabled && isInPeriod && isDismissed === false && !isHiddenForSession
      }
    >
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <CelebrationHero />
          <Text style={styles.title}>오픈 이벤트 당첨자를 발표했어요!</Text>
          <Text style={styles.message}>
            스타벅스 기프티콘 당첨자 5분을{`\n`}여기담 인스타그램에서 확인해
            보세요.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={openLink}
            testID="event-notice-link-button"
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>인스타그램에서 확인하기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={dismiss}
            style={styles.dismissButton}
            testID="event-notice-dismiss-button"
          >
            <Text style={styles.dismissButtonText}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  dialog: {
    alignItems: 'center',
    backgroundColor: '#F7F7F8',
    borderRadius: 30,
    maxWidth: 320,
    padding: 22,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    width: '100%',
  },
  hero: {
    alignItems: 'center',
    height: HERO_HEIGHT,
    justifyContent: 'center',
    width: HERO_WIDTH,
  },
  illustration: {
    height: 112,
    width: 140,
  },
  title: {
    color: '#171719',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 28,
    marginTop: 12,
    textAlign: 'center',
  },
  message: {
    color: '#5A5A5F',
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.35,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#5B63E8',
    borderRadius: 26,
    height: 49,
    justifyContent: 'center',
    marginTop: 24,
  },
  primaryButtonPressed: {
    opacity: 0.8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.35,
  },
  dismissButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    height: 44,
    justifyContent: 'center',
    marginTop: 8,
  },
  dismissButtonText: {
    color: '#5A5A5F',
    fontSize: 15,
    fontWeight: '500',
  },
});
