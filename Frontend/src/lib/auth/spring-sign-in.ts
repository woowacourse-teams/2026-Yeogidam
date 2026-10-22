import {appleAuth} from '@invertase/react-native-apple-authentication';
import {Linking, Platform} from 'react-native';
import {InAppBrowser} from 'react-native-inappbrowser-reborn';

import {getSpringAuthorizationUrl, type SpringLoginResponse} from '../api/spring-auth-api';
import {AUTH_CALLBACK_URL} from './callback';
import {
  createCancelledAuthError,
  createProcessingAuthError,
  withAuthErrorStage,
} from './errors';
import {loginWithSpringAuthorizationCode} from './spring-session';

const OAUTH_CALLBACK_TIMEOUT_MS = 120_000;
const ANDROID_CALLBACK_GRACE_MS = 1_500;

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

function listenForAndroidOAuthCallback(provider: 'kakao' | 'google') {
  let resolveCallback: (url: string) => void = () => undefined;
  const callback = new Promise<string>(resolve => {
    resolveCallback = resolve;
  });
  const expected = new URL(AUTH_CALLBACK_URL);
  const subscription = Linking.addEventListener('url', ({url}) => {
    try {
      const received = new URL(url);
      if (
        received.protocol === expected.protocol &&
        received.host === expected.host &&
        received.pathname === expected.pathname &&
        received.searchParams.get('provider') === provider
      ) {
        resolveCallback(url);
      }
    } catch {
      // 로그인과 관계없는 딥링크는 브라우저 인증 결과에 영향을 주지 않습니다.
    }
  });
  return {callback, remove: () => subscription.remove()};
}

function waitBrieflyForCallback(callback: Promise<string>): Promise<string | null> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ANDROID_CALLBACK_GRACE_MS);
    callback.then(url => {
      clearTimeout(timer);
      resolve(url);
    });
  });
}

async function openSpringOAuthCallback(
  authUrl: string,
  provider: 'kakao' | 'google',
): Promise<string> {
  if (!(await InAppBrowser.isAvailable())) return waitForDeepLink(authUrl);

  // Android openAuth는 브라우저 닫힘과 딥링크 중 먼저 온 이벤트를 반환합니다.
  // 복귀 중 닫힘이 먼저 도착해도 실제 콜백을 놓치지 않도록 별도로 구독합니다.
  const androidCallback = Platform.OS === 'android'
    ? listenForAndroidOAuthCallback(provider)
    : null;
  try {
    const browserResult = InAppBrowser.openAuth(authUrl, AUTH_CALLBACK_URL, {
      dismissButtonStyle: 'cancel',
      preferredBarTintColor: '#ffffff',
      preferredControlTintColor: '#121212',
      showTitle: true,
      toolbarColor: '#ffffff',
      navigationBarColor: '#ffffff',
      navigationBarDividerColor: '#e4e4e7',
      forceCloseOnRedirection: true,
      ...(Platform.OS === 'android' ? {showInRecents: true} : {}),
      enableDefaultShare: false,
      ephemeralWebSession: false,
    });
    const result = await withTimeout(
      androidCallback
        ? Promise.race([
            browserResult.then(value => ({type: 'browser' as const, value})),
            androidCallback.callback.then(url => ({type: 'callback' as const, url})),
          ])
        : browserResult.then(value => ({type: 'browser' as const, value})),
      OAUTH_CALLBACK_TIMEOUT_MS,
    );
    if (result.type === 'callback') return result.url;
    if (result.value.type === 'success') return result.value.url;

    const delayedCallback = androidCallback
      ? await waitBrieflyForCallback(androidCallback.callback)
      : null;
    if (delayedCallback) return delayedCallback;
    throw createCancelledAuthError(
      result.value.type === 'cancel' ? 'browser_cancel' : 'browser_dismiss',
    );
  } finally {
    androidCallback?.remove();
  }
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
      throw createCancelledAuthError('oauth_access_denied');
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
    let authUrl: string;
    try {
      authUrl = await getSpringAuthorizationUrl(provider);
    } catch (error) {
      throw withAuthErrorStage(error, 'authorization_url');
    }
    if (new URL(authUrl).protocol !== 'https:') {
      throw withAuthErrorStage(createProcessingAuthError(), 'authorization_url');
    }

    let callbackUrl: string;
    try {
      callbackUrl = await openSpringOAuthCallback(authUrl, provider);
    } catch (error) {
      throw withAuthErrorStage(error, 'provider_authorization');
    }

    try {
      return getSpringOAuthCode(callbackUrl, provider);
    } catch (error) {
      throw withAuthErrorStage(error, 'callback');
    }
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
    throw withAuthErrorStage(createProcessingAuthError(), 'provider_authorization');
  }

  let credential: Awaited<ReturnType<typeof appleAuth.performRequest>>;
  try {
    credential = await withTimeout(
      appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
      }),
      OAUTH_CALLBACK_TIMEOUT_MS,
    );
  } catch (error) {
    if ((error as {code?: string})?.code === appleAuth.Error.CANCELED) {
      throw withAuthErrorStage(createCancelledAuthError(), 'provider_authorization');
    }
    throw withAuthErrorStage(error, 'provider_authorization');
  }

  if (!credential.authorizationCode) {
    throw withAuthErrorStage(createProcessingAuthError(), 'callback');
  }

  return {
    authorizationCode: credential.authorizationCode,
    fullName: getSpringAppleFullName(credential.fullName),
  };
}

export async function signInWithSpringApple(): Promise<SpringLoginResponse> {
  const {authorizationCode, fullName} = await getSpringAppleCredential();
  return loginWithSpringAuthorizationCode('apple', authorizationCode, fullName);
}
