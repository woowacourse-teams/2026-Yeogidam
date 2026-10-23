import {useEffect, useState} from 'react';

/** 스플래시를 최소한 이만큼 보여 줍니다. 업데이트 정책 읽기가 더 빨라도 이 시간은 채웁니다. */
const SPLASH_MIN_DURATION_MS = 2000;

/**
 * 앱 첫 화면의 문지기입니다. 업데이트 정책을 읽는 동안 스플래시를 최소 시간만큼 보여 줍니다.
 * 세션 확인은 useSpringAuthFlow가 따로 맡고, 온보딩 표시는 세션이 없을 때 App이 정합니다.
 */
export function useSplashGate(refreshUpdatePolicy: () => Promise<unknown>) {
  const [isSplashVisible, setIsSplashVisible] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let splashTimer: ReturnType<typeof setTimeout> | undefined;

    const splashDelay = new Promise<void>(resolve => {
      splashTimer = setTimeout(() => resolve(), SPLASH_MIN_DURATION_MS);
    });

    Promise.allSettled([refreshUpdatePolicy(), splashDelay]).finally(() => {
      if (!isMounted) {
        return;
      }

      setIsSplashVisible(false);
    });

    return () => {
      isMounted = false;
      if (splashTimer) {
        clearTimeout(splashTimer);
      }
    };
  }, [refreshUpdatePolicy]);

  return {isSplashVisible};
}
