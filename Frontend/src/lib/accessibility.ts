import {useEffect, useState} from 'react';
import {AccessibilityInfo, findNodeHandle} from 'react-native';
import type {Component, RefObject} from 'react';

/** 화면 변화 없이 상태만 바뀔 때 스크린 리더로 읽어 줍니다. 스크린 리더가 꺼져 있으면 아무 일도 없어요. */
export function announce(message: string) {
  AccessibilityInfo.announceForAccessibility(message);
}

/**
 * 스크린 리더 포커스를 지정한 요소로 옮깁니다. 요소가 막 나타났거나 애니메이션 중이면
 * 포커스가 무시될 수 있어 조금 기다렸다가 옮깁니다.
 */
export function focusAccessibility(
  ref: RefObject<Component | null>,
  delayMs = 0,
) {
  const timer = setTimeout(() => {
    const node = ref.current ? findNodeHandle(ref.current) : null;
    if (node) {
      AccessibilityInfo.setAccessibilityFocus(node);
    }
  }, delayMs);
  return () => clearTimeout(timer);
}

/** 스크린 리더(VoiceOver/TalkBack)가 켜져 있는지 구독합니다. */
export function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then(value => {
        if (isMounted) {
          setEnabled(value);
        }
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setEnabled,
    );
    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
