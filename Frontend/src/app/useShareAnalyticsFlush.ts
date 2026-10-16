import {useEffect} from 'react';
import {AppState} from 'react-native';

import {syncShareAnalyticsConfiguration} from '../lib/share-intent';
import {flushShareAnalytics} from '../lib/share-intent/posthog-share';

const FLUSH_INTERVAL_MS = 30_000;

/**
 * 공유 익스텐션이 네이티브에 쌓아 둔 지표를 앱이 활성 상태일 때 주기적으로, 그리고 포그라운드로
 * 돌아올 때 PostHog로 보냅니다. 처음 한 번은 익스텐션이 쓸 지표 설정도 맞춥니다.
 */
export function useShareAnalyticsFlush() {
  useEffect(() => {
    syncShareAnalyticsConfiguration().catch(() => undefined);
    flushShareAnalytics().catch(() => undefined);
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') {
        flushShareAnalytics().catch(() => undefined);
      }
    }, FLUSH_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') flushShareAnalytics().catch(() => undefined);
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
}
