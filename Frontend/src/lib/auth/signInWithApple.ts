import {Platform} from 'react-native';
import {appleAuth} from '@invertase/react-native-apple-authentication';

import {
  createCancelledAuthError,
  createProcessingAuthError,
  normalizeAuthError,
} from './errors';
import {loginWithAuthorizationCode} from './loginApi';

const APPLE_AUTH_TIMEOUT_MS = 120_000;
const LOGIN_REQUEST_TIMEOUT_MS = 15_000;
/** 서버가 받는 fullName의 최대 길이입니다. 서버처럼 UTF-16 코드 단위로 셉니다. */
const FULL_NAME_MAX_LENGTH = 255;
/** 한글 자모, 호환 자모, 완성형 음절입니다. */
const HANGUL_PATTERN = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;

class TimeoutError extends Error {
  constructor() {
    super('Apple sign-in timed out.');
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timerId = setTimeout(() => {
      reject(new TimeoutError());
    }, timeoutMs);

    promise
      .then(value => {
        clearTimeout(timerId);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timerId);
        reject(error);
      });
  });
}

/**
 * 애플이 첫 인증 때만 주는 이름을 서버에 보낼 한 문자열로 합칩니다. 한글 이름은 "홍길동"처럼 성과 이름을
 * 붙이고, 그 밖의 이름은 "Minsu Kim"처럼 이름과 성 순서로 띄어 씁니다. 255자를 넘으면 자르고, 이름이
 * 없으면 undefined입니다.
 */
export function toAppleFullName(
  fullName: {familyName: string | null; givenName: string | null} | null,
): string | undefined {
  const givenName = fullName?.givenName?.trim() ?? '';
  const familyName = fullName?.familyName?.trim() ?? '';
  const name = HANGUL_PATTERN.test(familyName + givenName)
    ? `${familyName}${givenName}`
    : [givenName, familyName].filter(Boolean).join(' ');
  const truncatedName = name.slice(0, FULL_NAME_MAX_LENGTH);

  // 자른 자리에 서로게이트 쌍의 앞 절반만 남으면 함께 뺍니다.
  return truncatedName.replace(/[\ud800-\udbff]$/, '').trim() || undefined;
}

export const isAppleSignInSupported =
  Platform.OS === 'ios' && appleAuth.isSupported;

/** 기기 로그인 창에서 인가 코드와 이름을 받습니다. 이름은 처음 인증할 때만 옵니다. */
async function requestAppleCredential() {
  if (!isAppleSignInSupported) {
    throw createProcessingAuthError();
  }

  const credential = await withTimeout(
    appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    }),
    APPLE_AUTH_TIMEOUT_MS,
  );

  if (!credential.authorizationCode) {
    throw createProcessingAuthError();
  }

  return {
    authorizationCode: credential.authorizationCode,
    fullName: toAppleFullName(credential.fullName),
  };
}

function toAppleAuthError(error: unknown) {
  const appleError = error as {code?: string} | null;

  if (appleError?.code === appleAuth.Error.CANCELED) {
    return createCancelledAuthError();
  }

  return normalizeAuthError(error);
}

export async function signInWithApple(): Promise<void> {
  try {
    const {authorizationCode, fullName} = await requestAppleCredential();

    await withTimeout(
      loginWithAuthorizationCode('apple', {
        authorizationCode,
        ...(fullName ? {fullName} : {}),
      }),
      LOGIN_REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    throw toAppleAuthError(error);
  }
}

/**
 * 회원탈퇴 재인증입니다. 기기 로그인 창의 인가 코드만 돌려주며, 코드는 한 번만 쓸 수 있어 로그인에 보내지
 * 않습니다.
 */
export async function reauthenticateWithApple(): Promise<string> {
  try {
    const {authorizationCode} = await requestAppleCredential();

    return authorizationCode;
  } catch (error) {
    throw toAppleAuthError(error);
  }
}
