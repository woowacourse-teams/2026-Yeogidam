import type {Session} from '@supabase/supabase-js';

import {signInWithOAuth} from './signInWithOAuth';

export async function signInWithKakao(): Promise<Session> {
  return signInWithOAuth('kakao');
}
