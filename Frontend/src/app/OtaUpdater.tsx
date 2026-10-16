import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

import { decideOtaAction } from '../lib/ota-updates';

/**
 * EAS Update로 내보낸 JS 번들을 포그라운드 복귀 때 받아 적용합니다.
 * 콜드 스타트의 확인은 네이티브 expo-updates(checkAutomatically: ON_LOAD)가 맡으므로 여기서는 하지 않습니다.
 * 네이티브 설정이 없거나 개발 빌드면 expo-updates가 꺼져 있어 아무 일도 하지 않습니다.
 */
export function OtaUpdater() {
  // 네이티브가 시작 때 이미 확인했으므로 첫 간격은 지금부터 셉니다.
  const lastCheckedAtRef = useRef<number | null>(Date.now());
  const hasFetchedUpdateRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (inFlightRef.current) return;
      const action = decideOtaAction({
        isEnabled: Updates.isEnabled,
        hasFetchedUpdate: hasFetchedUpdateRef.current,
        lastCheckedAt: lastCheckedAtRef.current,
        now: Date.now(),
      });
      if (action === 'skip') return;

      inFlightRef.current = true;
      try {
        if (action === 'reload') {
          await Updates.reloadAsync();
          return;
        }
        lastCheckedAtRef.current = Date.now();
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew || fetched.isRollBackToEmbedded) {
          hasFetchedUpdateRef.current = true;
        }
      } catch {
        // 네트워크가 없거나 서버가 답하지 않으면 다음 복귀 때 다시 시도합니다.
      } finally {
        inFlightRef.current = false;
      }
    };

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') run().catch(() => undefined);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
