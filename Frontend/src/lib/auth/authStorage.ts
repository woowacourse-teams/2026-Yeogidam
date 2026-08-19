import * as Keychain from 'react-native-keychain';
import type {SupportedStorage} from '@supabase/supabase-js';
import {NativeModules, Platform} from 'react-native';

const shareModule = NativeModules.ShareIntentModule as {setAccessToken?: (token: string | null) => Promise<void>} | undefined;

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
    if (Platform.OS === 'ios' && key === SUPABASE_AUTH_STORAGE_KEY) {
      try {
        const parsed = JSON.parse(value);
        await shareModule?.setAccessToken?.(parsed?.access_token ?? null);
      } catch {
        await shareModule?.setAccessToken?.(null);
      }
    }
    return value;
  },
  async setItem(key: string, value: string) {
    await Keychain.setGenericPassword(STORAGE_USERNAME, value, {
      service: getServiceName(key),
    });
    if (Platform.OS === 'ios' && key === SUPABASE_AUTH_STORAGE_KEY) {
      try { const parsed = JSON.parse(value); await shareModule?.setAccessToken?.(parsed?.access_token ?? null); } catch {}
    }
  },
  async removeItem(key: string) {
    await Keychain.resetGenericPassword({
      service: getServiceName(key),
    });
    if (Platform.OS === 'ios' && key === SUPABASE_AUTH_STORAGE_KEY) await shareModule?.setAccessToken?.(null);
  },
};

export async function clearSecureAuthStorage() {
  await Promise.all(authStorageKeys.map(key => secureAuthStorage.removeItem(key)));
}
