import {useEffect} from 'react';
import {AppState} from 'react-native';

import {ensureLocationPermission} from '../lib/location-permission';

/**
 * 메인 화면에 들어온 뒤 다음 프레임에 위치 권한을 확인하고, 포그라운드로 돌아올 때마다 다시 확인합니다.
 * enabled가 꺼지면 예약과 구독을 거둡니다.
 */
export function useLocationPermissionRequest(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const request = () => {
      if (AppState.currentState === 'active')
        ensureLocationPermission(true).catch(error =>
          console.warn('위치 권한 확인 실패', error),
        );
    };
    const frame = requestAnimationFrame(request);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') request();
    });
    return () => {
      cancelAnimationFrame(frame);
      subscription.remove();
    };
  }, [enabled]);
}
