import Config from 'react-native-config';

import { configureHistoryApi } from '../entities/content/api';
import {
  configurePlaceReelsApi,
  configureProfilesApi,
  configureSavedPlacesApi,
} from '../entities/info/api';
import { configureAppUpdatePolicyApi } from '../lib/app-update-policy';
import { configureAccountDeletionApi } from '../lib/auth/deleteAccount';
import { configureLoginApi } from '../lib/auth/loginApi';
import { reauthenticateWithApple } from '../lib/auth/signInWithApple';
import { reauthenticateWithOAuth } from '../lib/auth/signInWithOAuth';
import {supabase} from '../lib/auth/supabase';
import {
  configureTokenClient,
  getAccessToken,
  logout,
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
  configureLoginApi({ baseUrl: API_BASE_URL });

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

  const serverOptions = {
    baseUrl: API_BASE_URL,
    getAccessToken: sharedOptions.getAccessToken,
    refreshSession: sharedOptions.refreshSession,
  };

  configureProfilesApi(serverOptions);
  configureSavedPlacesApi({ ...sharedOptions, baseUrl: API_BASE_URL });
  configurePlaceReelsApi({ ...sharedOptions, baseUrl: API_BASE_URL });
  configureHistoryApi({ ...sharedOptions, baseUrl: API_BASE_URL });
  configureAccountDeletionApi({
    ...serverOptions,
    // 재인증은 로그인과 같은 창에서 인가 코드만 받습니다. 인가 URL 경로의 제공자 값은 소문자입니다.
    requestAuthorizationCode: provider =>
      provider === 'APPLE'
        ? reauthenticateWithApple()
        : reauthenticateWithOAuth(provider === 'KAKAO' ? 'kakao' : 'google'),
    // 탈퇴 뒤에는 토큰 클라이언트가 네이티브 공유 저장소의 서버 세션을 지우고 로그아웃을 알립니다.
    clearSession: logout,
  });
  configureAppUpdatePolicyApi({ baseUrl: API_BASE_URL });
}
