import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@react-native-vector-icons/material-icons/static';
import Svg, { Path } from 'react-native-svg';
import {
  dismissSavedPlacesGuide,
  hasDismissedSavedPlacesGuide,
} from '../../../lib/saved-places-guide-storage';

function OpenBookIcon() {
  return (
    <Svg width={26} height={24} viewBox="0 0 28 26" fill="none">
      <Path
        d="M14 6.2C10.5 3.6 6.1 3.3 2.8 5.2v16.2c3.5-1.8 7.7-1.5 11.2 1.1m0-16.3C17.5 3.6 21.9 3.3 25.2 5.2v16.2c-3.5-1.8-7.7-1.5-11.2 1.1m0-16.3v16.3"
        stroke="#8589C8"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type SavedPlacesGuideNoticeProps = {
  topOffset: number;
  onOpenGuide: () => void;
};

const TOAST_DURATION_MS = 1600;

export function SavedPlacesGuideNotice({
  topOffset,
  onOpenGuide,
}: SavedPlacesGuideNoticeProps) {
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [renderToast, setRenderToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isMounted = true;
    hasDismissedSavedPlacesGuide()
      .then(dismissed => {
        if (isMounted) setIsDismissed(dismissed);
      })
      .catch(() => {
        if (isMounted) setIsDismissed(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!renderToast) return;

    const animation = Animated.timing(toastOpacity, {
      toValue: showToast ? 1 : 0,
      duration: showToast ? 160 : 180,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !showToast) setRenderToast(false);
    });
    return () => animation.stop();
  }, [renderToast, showToast, toastOpacity]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const handleDismiss = () => {
    setIsDismissed(true);
    dismissSavedPlacesGuide().catch(() => undefined);
    setRenderToast(true);
    setShowToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(
      () => setShowToast(false),
      TOAST_DURATION_MS,
    );
  };

  return (
    <View
      testID="saved-places-guide-overlay"
      pointerEvents="box-none"
      style={[styles.overlay, { top: topOffset }]}
    >
      {isDismissed === false ? (
        <View testID="saved-places-guide-card" style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="저장 방법 알아보기"
            onPress={onOpenGuide}
            style={({ pressed }) => [
              styles.openGuideButton,
              pressed && styles.pressed,
            ]}
          >
            <OpenBookIcon />
            <View style={styles.labelAndChevron}>
              <Text numberOfLines={1} style={styles.label}>
                저장 방법 알아보기
              </Text>
              <MaterialIcons color="#87899A" name="chevron-right" size={19} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="저장 방법 안내 숨기기"
            hitSlop={8}
            onPress={handleDismiss}
            style={({ pressed }) => [
              styles.dismissButton,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons color="#858797" name="close" size={19} />
          </Pressable>
        </View>
      ) : null}
      {renderToast ? (
        <Animated.View
          testID="saved-places-guide-toast"
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={[styles.toast, { opacity: toastOpacity }]}
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            numberOfLines={1}
            style={styles.toastText}
          >
            다시 보려면 내 정보 &gt; 사용 가이드에서 확인할 수 있어요.
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 7,
    elevation: 7,
  },
  card: {
    height: 48,
    paddingLeft: 12,
    paddingRight: 4,
    borderWidth: 1,
    borderColor: '#E1E3F6',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.98)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#1F2238',
    shadowOpacity: 0.035,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 1,
  },
  openGuideButton: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  labelAndChevron: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  label: {
    flexShrink: 1,
    color: '#1F2238',
    fontSize: 13,
    fontWeight: '700',
  },
  dismissButton: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.65 },
  toast: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1F2238',
    paddingLeft: 20,
    paddingRight: 12,
    justifyContent: 'center',
  },
  toastText: {
    color: '#E2E4F0',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
