import type {SpringLoginResponse} from '../api/spring-auth-api';
import {normalizeAuthError} from './errors';
import {signInWithSpringOAuth} from './spring-sign-in';

export type SupportedOAuthProvider = 'google' | 'kakao';

/** Spring 로그인 흐름을 실행하고 실패는 로그인 화면 계약(NormalizedAuthError)으로 바꿉니다. */
export async function signInWithOAuth(
  provider: SupportedOAuthProvider,
): Promise<SpringLoginResponse> {
  try {
    return await signInWithSpringOAuth(provider);
  } catch (error) {
    throw normalizeAuthError(error);
  }
}
