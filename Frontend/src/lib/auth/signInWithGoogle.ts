import {signInWithOAuth} from './signInWithOAuth';

export function signInWithGoogle(): Promise<void> {
  return signInWithOAuth('google');
}
