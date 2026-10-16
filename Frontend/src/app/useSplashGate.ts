import {useCallback, useEffect, useState} from 'react';

import {
  completeAppGuide,
  hasCompletedAppGuide,
  hasSignedInOnThisInstall,
} from '../lib/app-guide-storage';

/** 스플래시를 최소한 이만큼 보여 줍니다. 저장소와 업데이트 정책 읽기가 더 빨라도 이 시간은 채웁니다. */
const SPLASH_MIN_DURATION_MS = 2000;

/**
 * 앱 안내를 보여 줘야 하는지입니다. loading은 저장소를 아직 읽는 중, required는 안내가 필요함,
 * completed는 안내를 마쳤거나 이 설치에서 로그인한 적이 있음입니다.
 */
export type GuideStatus = 'loading' | 'required' | 'completed';

/**
 * 앱 첫 화면의 문지기입니다. 안내 완료 여부와 업데이트 정책을 읽는 동안 스플래시를 최소 시간만큼 보여 주고,
 * 안내 상태(guideStatus)를 들고 있습니다. 세션 확인은 useSpringAuthFlow가 따로 맡습니다.
 */
export function useSplashGate(refreshUpdatePolicy: () => Promise<unknown>) {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [guideStatus, setGuideStatus] = useState<GuideStatus>('loading');

  useEffect(() => {
    let isMounted = true;
    let splashTimer: ReturnType<typeof setTimeout> | undefined;

    const loadGuideCompletion = async () => {
      const [completed, signedInOnThisInstall] = await Promise.all([
        hasCompletedAppGuide(),
        hasSignedInOnThisInstall(),
      ]);

      if (isMounted) {
        setGuideStatus(completed || signedInOnThisInstall ? 'completed' : 'required');
      }
    };

    const splashDelay = new Promise<void>(resolve => {
      splashTimer = setTimeout(() => resolve(), SPLASH_MIN_DURATION_MS);
    });

    Promise.allSettled([refreshUpdatePolicy(), loadGuideCompletion(), splashDelay]).finally(
      () => {
        if (!isMounted) {
          return;
        }

        setIsSplashVisible(false);
      },
    );

    return () => {
      isMounted = false;
      if (splashTimer) {
        clearTimeout(splashTimer);
      }
    };
  }, [refreshUpdatePolicy]);

  /** 안내를 마쳤다고 기록합니다. 화면은 바로 넘어가고 저장은 뒤에서 합니다. */
  const completeGuide = useCallback(() => {
    setGuideStatus('completed');
    completeAppGuide();
  }, []);

  return {isSplashVisible, guideStatus, completeGuide};
}
