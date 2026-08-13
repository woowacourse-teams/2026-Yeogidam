import * as Keychain from 'react-native-keychain';
import type {SupportedStorage} from '@supabase/supabase-js';

const STORAGE_USERNAME = 'supabase';
const STORAGE_SERVICE_PREFIX = 'com.yeogidamm.app.supabase';

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
