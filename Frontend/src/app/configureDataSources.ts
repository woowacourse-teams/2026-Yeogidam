import Config from 'react-native-config';

import {
  configurePlaceReelsApi,
  configureProfilesApi,
  configureSavedPlacesApi,
} from '../entities/info/api';
import {supabase} from '../lib/auth/supabase';
import {
  configureTokenClient,
  getAccessToken,
  refreshSession,
} from '../lib/auth/tokenClient';

/**
 * 앱 시작 시 한 번만 실행하는 외부 데이터 소스 설정입니다.
 * 화면은 이 설정이나 Supabase를 직접 알 필요가 없습니다.
 */
export function configureDataSources() {
  const { API_BASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = Config;

  // 서버 주소가 없으면 목 데이터로 둡니다.
  // Supabase 키는 데이터 계층을 서버로 옮기는 동안만 함께 확인합니다.
  if (!API_BASE_URL || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return;
  }

  configureTokenClient({ baseUrl: API_BASE_URL });

  const sharedOptions = {
    baseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    getAccessToken,
    getUserId: async () => {
      const {
        data: {session},
      } = await supabase.auth.getSession();

      return session?.user.id ?? null;
    },
    refreshSession,
  };

  configureProfilesApi(sharedOptions);
  configureSavedPlacesApi(sharedOptions);
  configurePlaceReelsApi(sharedOptions);
}
