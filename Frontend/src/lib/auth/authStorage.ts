import * as Keychain from 'react-native-keychain';
import type {SupportedStorage} from '@supabase/supabase-js';

import {getShareSession, setShareSession, type NativeShareSession} from '../share-intent';

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

    return credentials.password;
  },
  async setItem(key: string, value: string) {
    await Keychain.setGenericPassword(STORAGE_USERNAME, value, {
      service: getServiceName(key),
    });
  },
  async removeItem(key: string) {
    await Keychain.resetGenericPassword({
      service: getServiceName(key),
    });
  },
};

export async function clearSecureAuthStorage() {
  await Promise.all(authStorageKeys.map(key => secureAuthStorage.removeItem(key)));
}

/** Reads the session from the native store shared with the share extension. A store failure reads as no session. */
export async function loadAuthSession(): Promise<NativeShareSession | null> {
  try {
    return await getShareSession();
  } catch {
    return null;
  }
}

/** Throws when the native store cannot save the session. */
export function saveAuthSession(session: NativeShareSession): Promise<void> {
  return setShareSession(session);
}

/** Never throws, so a logout always finishes on this device. */
export async function clearAuthSession(): Promise<void> {
  try {
    await setShareSession(null);
  } catch {
    // A session left behind is cleared again when the server rejects its next refresh.
  }
}
