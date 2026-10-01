import * as Keychain from 'react-native-keychain';
import type {SupportedStorage} from '@supabase/supabase-js';
import {NativeModules} from 'react-native';

type SharedSession = {accessToken: string; refreshToken: string; expiresAt: number; userId: string};
const shareModule = NativeModules.ShareIntentModule as {
  setShareSession?: (session: SharedSession | null) => Promise<void>;
  getShareSession?: () => Promise<SharedSession | null>;
} | undefined;

const STORAGE_USERNAME = 'supabase';
const STORAGE_SERVICE_PREFIX = 'com.yeogidamm.app.supabase';
const SUPABASE_AUTH_STORAGE_KEY = 'supabase.auth.token';

const authStorageKeys = [
  SUPABASE_AUTH_STORAGE_KEY,
  `${SUPABASE_AUTH_STORAGE_KEY}-user`,
  `${SUPABASE_AUTH_STORAGE_KEY}-code-verifier`,
  `${SUPABASE_AUTH_STORAGE_KEY}-flows-code-verifier`,
];

function getServiceName(key: string) {
  return `${STORAGE_SERVICE_PREFIX}.${key}`;
}

export const secureAuthStorage: SupportedStorage = {
  async getItem(key: string) {
    const credentials = await Keychain.getGenericPassword({
      service: getServiceName(key),
    });

    if (!credentials) {
      return null;
    }

    const value = credentials.password;
    if (key !== SUPABASE_AUTH_STORAGE_KEY) return value;
    try {
      const parsed = JSON.parse(value);
      const shared = await shareModule?.getShareSession?.();
      if (
        shared != null &&
        shared.accessToken.length > 0 &&
        shared.userId === parsed?.user?.id &&
        shared.expiresAt > (parsed?.expires_at ?? 0)
      ) {
        const updated = JSON.stringify({
          ...parsed,
          access_token: shared.accessToken,
          refresh_token: shared.refreshToken,
          expires_at: shared.expiresAt,
          expires_in: Math.max(0, shared.expiresAt - Math.floor(Date.now() / 1000)),
        });
        await Keychain.setGenericPassword(STORAGE_USERNAME, updated, {
          service: getServiceName(key),
        });
        return updated;
      }
    } catch {
      // Keep the SDK's persisted session when the native share store is unavailable.
    }
    return value;
  },
  async setItem(key: string, value: string) {
    await Keychain.setGenericPassword(STORAGE_USERNAME, value, {
      service: getServiceName(key),
    });
    if (key === SUPABASE_AUTH_STORAGE_KEY) {
      try {
        const parsed = JSON.parse(value);
        if (parsed?.refresh_token && parsed?.user?.id) {
          await shareModule?.setShareSession?.({
            accessToken: typeof parsed.access_token === 'string' ? parsed.access_token : '',
            refreshToken: parsed.refresh_token,
            expiresAt: parsed.expires_at ?? 0,
            userId: parsed.user.id,
          });
        }
      } catch {
        // The app session remains available even if share session sync fails.
      }
    }
  },
  async removeItem(key: string) {
    await Keychain.resetGenericPassword({
      service: getServiceName(key),
    });
    if (key === SUPABASE_AUTH_STORAGE_KEY) await shareModule?.setShareSession?.(null);
  },
};

export async function clearSecureAuthStorage() {
  await Promise.all(authStorageKeys.map(key => secureAuthStorage.removeItem(key)));
}
