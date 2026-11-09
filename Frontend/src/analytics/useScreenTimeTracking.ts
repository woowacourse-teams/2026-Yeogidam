import {useEffect, useRef} from 'react';
import {AppState, type AppStateStatus} from 'react-native';

import type {AnalyticsClient} from './analytics';
import {trackScreenLeft, trackScreenViewed} from './uiEvents';

type CurrentScreen = {
  name: string;
  key: string;
  /** 측정 중인 구간의 시작 시각입니다. 앱이 백그라운드에 있으면 null입니다. */
  startedAt: number | null;
};

/**
 * 화면 진입(`screen_viewed`)과 이탈(`screen_left`)을 기록해 화면별 체류 시간을 잽니다.
 *
 * - `screenKey`가 바뀌면 직전 화면의 체류 시간을 `navigate`로 보내고 새 화면의 진입을 기록합니다.
 *   같은 이름의 화면이 겹쳐 쌓일 때(장소 상세 → 다른 장소 상세)도 따로 재려고 이름 대신 키로 비교합니다.
 * - 앱이 백그라운드로 가면 그때까지의 시간을 `background`로 보내고 멈췄다가,
 *   다시 활성화되면 같은 화면에서 새로 잽니다. 그래서 앱을 내려 둔 시간은 들어가지 않습니다.
 */
export function useScreenTimeTracking(
  client: AnalyticsClient | null | undefined,
  screenName: string,
  screenKey: string = screenName,
  now: () => number = Date.now,
) {
  const clientRef = useRef(client);
  clientRef.current = client;
  const nowRef = useRef(now);
  nowRef.current = now;
  const currentRef = useRef<CurrentScreen | null>(null);

  useEffect(() => {
    const previous = currentRef.current;
    if (previous?.key === screenKey) {
      // 키는 그대로인데 이름만 바뀐 경우(거의 없음)에는 이름만 고칩니다.
      previous.name = screenName;
      return;
    }
    const at = nowRef.current();
    if (previous && previous.startedAt !== null) {
      trackScreenLeft(
        clientRef.current,
        previous.name,
        at - previous.startedAt,
        'navigate',
      );
    }
    currentRef.current = {
      name: screenName,
      key: screenKey,
      startedAt: AppState.currentState === 'background' ? null : at,
    };
    trackScreenViewed(clientRef.current, screenName);
  }, [screenKey, screenName]);

  useEffect(() => {
    const handleChange = (state: AppStateStatus) => {
      const current = currentRef.current;
      if (!current) return;
      // iOS의 inactive(제어 센터, 알림 센터)는 잠깐 가려진 것이라 멈추지 않습니다.
      if (state === 'background') {
        if (current.startedAt === null) return;
        trackScreenLeft(
          clientRef.current,
          current.name,
          nowRef.current() - current.startedAt,
          'background',
        );
        current.startedAt = null;
        return;
      }
      if (state === 'active' && current.startedAt === null) {
        current.startedAt = nowRef.current();
      }
    };
    const subscription = AppState.addEventListener('change', handleChange);
    return () => subscription.remove();
  }, []);
}
