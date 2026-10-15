import type {SpringLoginResponse} from '../api/spring-auth-api';
import {signInWithOAuth} from './signInWithOAuth';

export function signInWithKakao(): Promise<SpringLoginResponse> {
  return signInWithOAuth('kakao');
}
