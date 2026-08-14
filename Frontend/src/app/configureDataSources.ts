import Config from 'react-native-config';

import {
  configurePlaceReelsApi,
  configureProfilesApi,
  configureSavedPlacesApi,
} from '../entities/info/api';
import {supabase} from '../lib/auth/supabase';

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function createProfileSeed(
  email: string | undefined,
  userMetadata: Record<string, unknown> | undefined,
) {
  const nickname =
    firstNonEmptyString(
      userMetadata?.nickname,
      userMetadata?.name,
      userMetadata?.full_name,
      userMetadata?.user_name,
      userMetadata?.preferred_username,
    ) ?? firstNonEmptyString(email?.split('@')[0]);
  const avatarUrl = firstNonEmptyString(
    userMetadata?.avatar_url,
    userMetadata?.picture,
    userMetadata?.profile_image,
  );

  return {
    nickname,
    avatarUrl,
  };
}

/**
 * 앱 시작 시 한 번만 실행하는 외부 데이터 소스 설정입니다.
 * 화면은 이 설정이나 Supabase를 직접 알 필요가 없습니다.
 */
export function configureDataSources() {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = Config;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return;
  }

  const sharedOptions = {
    baseUrl: SUPABASE_URL,
    publishableKey: SUPABASE_PUBLISHABLE_KEY,
    getAccessToken: async () => {
      const {
        data: {session},
      } = await supabase.auth.getSession();

      return session?.access_token ?? null;
    },
    getUserId: async () => {
      const {
        data: {session},
      } = await supabase.auth.getSession();

      return session?.user.id ?? null;
    },
    getProfileSeed: async () => {
      const {
        data: {user},
      } = await supabase.auth.getUser();

      if (!user) {
        return null;
      }

      return createProfileSeed(
        user.email,
        user.user_metadata as Record<string, unknown> | undefined,
      );
    },
    refreshSession: async () => {
      const {
        data: {session},
        error,
      } = await supabase.auth.refreshSession();

      return !error && Boolean(session);
    },
  };

  configureProfilesApi(sharedOptions);
  configureSavedPlacesApi(sharedOptions);
  configurePlaceReelsApi(sharedOptions);
}
