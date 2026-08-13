import type {Session} from '@supabase/supabase-js';

import {signInWithOAuth} from './signInWithOAuth';

export function signInWithGoogle(): Promise<Session> {
  return signInWithOAuth('google');
}
