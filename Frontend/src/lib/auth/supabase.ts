import {AppState, Platform} from 'react-native';
import {createClient, processLock} from '@supabase/supabase-js';
import Config from 'react-native-config';

import {secureAuthStorage} from './authStorage';

function requiredEnvironmentValue(
  name: 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY',
): string {
  const value = Config[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const SUPABASE_URL = requiredEnvironmentValue('SUPABASE_URL');
export const SUPABASE_PUBLISHABLE_KEY = requiredEnvironmentValue(
  'SUPABASE_PUBLISHABLE_KEY',
);

export const AUTH_CALLBACK_URL = 'com.yeogidamm.app://auth-callback';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    ...(Platform.OS !== 'web' ? {storage: secureAuthStorage} : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    lock: processLock,
  },
});

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
      return;
    }

    supabase.auth.stopAutoRefresh();
  });
}
