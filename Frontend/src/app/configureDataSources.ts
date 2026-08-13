import Config from 'react-native-config';

import {
  configurePlaceReelsApi,
  configureSavedPlacesApi,
} from '../entities/info/api';

/**
 * 앱 시작 시 한 번만 실행하는 외부 데이터 소스 설정입니다.
 * 화면은 이 설정이나 Supabase를 직접 알 필요가 없습니다.
 */
export function configureDataSources() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = Config;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return;
  }

  configureSavedPlacesApi({
    baseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
  });
  configurePlaceReelsApi({
    baseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
  });
}
