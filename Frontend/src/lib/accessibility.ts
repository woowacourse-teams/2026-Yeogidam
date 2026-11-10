import {useEffect, useState} from 'react';
import {AccessibilityInfo, findNodeHandle} from 'react-native';
import type {Component, RefObject} from 'react';
import type {TextStyle} from 'react-native';

/**
 * 화면에는 보이지 않고 스크린 리더만 읽는 글자에 씁니다(웹의 sr-only).
 * iOS VoiceOver는 투명도(opacity)가 0인 요소를 건너뛰므로(기기에서 확인), opacity 대신 1pt 크기와 투명한 글자색으로 숨깁니다.
 */
export const visuallyHiddenTextStyle: TextStyle = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  color: 'transparent',
};

/**
 * 화면 변화 없이 상태만 바뀔 때 스크린 리더로 읽어 줍니다. 스크린 리더가 꺼져 있으면 아무 일도 없어요.
 * iOS VoiceOver는 다른 것을 읽는 중에 들어온 안내를 버립니다. 앱으로 돌아온 직후처럼 화면을 읽고 있을
 * 때는 `queue`를 켜서 지금 읽는 내용 뒤에 읽게 합니다(Android는 이 옵션을 무시해요).
 */
export function announce(message: string, options?: {queue?: boolean}) {
  if (options?.queue) {
    AccessibilityInfo.announceForAccessibilityWithOptions(message, {queue: true});
    return;
  }
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
    // 기다리는 사이 화면이 닫히는 등 요소를 찾지 못해도 앱 동작에는 영향이 없도록 조용히 넘깁니다.
    try {
      const node = ref.current ? findNodeHandle(ref.current) : null;
      if (node) {
        AccessibilityInfo.setAccessibilityFocus(node);
      }
    } catch {
      // 포커스 이동은 보조 기능이라 실패해도 무시합니다.
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
