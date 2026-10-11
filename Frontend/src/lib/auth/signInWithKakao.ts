import {signInWithOAuth} from './signInWithOAuth';

export async function signInWithKakao(): Promise<void> {
  return signInWithOAuth('kakao');
}
