import {appleAuth} from '@invertase/react-native-apple-authentication';
import {Linking, Platform} from 'react-native';
import {InAppBrowser} from 'react-native-inappbrowser-reborn';

import {getSpringAuthorizationUrl, type SpringLoginResponse} from '../api/spring-auth-api';
import {AUTH_CALLBACK_URL} from './callback';
import {createCancelledAuthError, createProcessingAuthError} from './errors';
import {loginWithSpringAuthorizationCode} from './spring-session';

const OAUTH_CALLBACK_TIMEOUT_MS = 120_000;

/** normalizeAuthError가 시간 초과로 분류하도록 이름을 TimeoutError로 둡니다. */
function oauthTimeoutError(message: string): Error {
  const error = new Error(message);
  error.name = 'TimeoutError';
  return error;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(oauthTimeoutError('OAuth request timed out.')), timeoutMs);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function waitForDeepLink(authUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.remove();
      reject(oauthTimeoutError('OAuth callback timed out.'));
    }, OAUTH_CALLBACK_TIMEOUT_MS);
    const subscription = Linking.addEventListener('url', ({url}) => {
      clearTimeout(timer);
      subscription.remove();
      resolve(url);
    });
    Linking.openURL(authUrl).catch(error => {
      clearTimeout(timer);
      subscription.remove();
      reject(error);
    });
  });
}

async function openSpringOAuthCallback(authUrl: string): Promise<string> {
  if (!(await InAppBrowser.isAvailable())) return waitForDeepLink(authUrl);

  const result = await withTimeout(
    InAppBrowser.openAuth(authUrl, AUTH_CALLBACK_URL, {
      dismissButtonStyle: 'cancel',
      preferredBarTintColor: '#ffffff',
      preferredControlTintColor: '#121212',
      showTitle: true,
      toolbarColor: '#ffffff',
      navigationBarColor: '#ffffff',
      navigationBarDividerColor: '#e4e4e7',
      forceCloseOnRedirection: true,
      enableDefaultShare: false,
      ephemeralWebSession: false,
    }),
    OAUTH_CALLBACK_TIMEOUT_MS,
  );
  if (result.type !== 'success') throw createCancelledAuthError();
  return result.url;
}

export function getSpringOAuthCode(
  callbackUrl: string,
  provider: 'kakao' | 'google',
): string {
  try {
    const callback = new URL(callbackUrl);
    const expected = new URL(AUTH_CALLBACK_URL);
    if (
      callback.protocol !== expected.protocol ||
      callback.host !== expected.host ||
      callback.pathname !== expected.pathname ||
      callback.searchParams.get('provider') !== provider
    ) {
      throw createProcessingAuthError();
    }

    if (callback.searchParams.get('error') === 'access_denied') {
      throw createCancelledAuthError();
    }
    if (callback.searchParams.has('error')) throw createProcessingAuthError();

    const code = callback.searchParams.get('code');
    if (!code) throw createProcessingAuthError();
    return code;
  } catch (error) {
    if (error && typeof error === 'object' && 'errorCode' in error) throw error;
    throw createProcessingAuthError();
  }
}

/** 로그인 API를 부르지 않고 제공자 인가 코드만 받습니다. 회원탈퇴 재인증에서도 사용합니다. */
export async function getSpringOAuthAuthorizationCode(
  provider: 'kakao' | 'google',
): Promise<string> {
  try {
    const authUrl = await getSpringAuthorizationUrl(provider);
    if (new URL(authUrl).protocol !== 'https:') throw createProcessingAuthError();

    const callbackUrl = await openSpringOAuthCallback(authUrl);
    return getSpringOAuthCode(callbackUrl, provider);
  } finally {
    InAppBrowser.closeAuth();
  }
}

export async function signInWithSpringOAuth(
  provider: 'kakao' | 'google',
): Promise<SpringLoginResponse> {
  const code = await getSpringOAuthAuthorizationCode(provider);
  return loginWithSpringAuthorizationCode(provider, code);
}

type AppleFullName = Awaited<ReturnType<typeof appleAuth.performRequest>>['fullName'];

export function getSpringAppleFullName(fullName: AppleFullName): string | null {
  const givenName = fullName?.givenName?.trim();
  const familyName = fullName?.familyName?.trim();
  if (!givenName && !familyName) return null;

  const koreanName = /[가-힣]/.test(`${familyName ?? ''}${givenName ?? ''}`);
  return koreanName
    ? `${familyName ?? ''}${givenName ?? ''}`
    : [givenName, familyName].filter(Boolean).join(' ');
}

type SpringAppleCredential = {
  authorizationCode: string;
  fullName: string | null;
};

/** 애플 인가 코드와 최초 로그인 때만 내려오는 이름을 받습니다. */
export async function getSpringAppleCredential(): Promise<SpringAppleCredential> {
  if (Platform.OS !== 'ios' || !appleAuth.isSupported) {
    throw createProcessingAuthError();
  }

  try {
    const credential = await withTimeout(
      appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
      }),
      OAUTH_CALLBACK_TIMEOUT_MS,
    );
    if (!credential.authorizationCode) throw createProcessingAuthError();

    return {
      authorizationCode: credential.authorizationCode,
      fullName: getSpringAppleFullName(credential.fullName),
    };
  } catch (error) {
    if ((error as {code?: string})?.code === appleAuth.Error.CANCELED) {
      throw createCancelledAuthError();
    }
    throw error;
  }
}

export async function signInWithSpringApple(): Promise<SpringLoginResponse> {
  const {authorizationCode, fullName} = await getSpringAppleCredential();
  return loginWithSpringAuthorizationCode('apple', authorizationCode, fullName);
}
