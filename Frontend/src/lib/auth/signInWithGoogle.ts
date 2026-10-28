import type {SpringLoginResponse} from '../api/spring-auth-api';
import {signInWithOAuth} from './signInWithOAuth';

export function signInWithGoogle(): Promise<SpringLoginResponse> {
  return signInWithOAuth('google');
}
