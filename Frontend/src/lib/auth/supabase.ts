import {AppState, Platform} from 'react-native';
import {createClient, processLock} from '@supabase/supabase-js';

import {secureAuthStorage} from './authStorage';

export const SUPABASE_URL = 'https://hbbrgudsbvnwuylxqlta.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_2bScMGo7Zpgmb9Q7lSA1Ag_sXmiGvCX';

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
