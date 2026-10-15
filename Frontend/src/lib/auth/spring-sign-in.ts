import {appleAuth} from '@invertase/react-native-apple-authentication';
import {Linking, Platform} from 'react-native';
import {InAppBrowser} from 'react-native-inappbrowser-reborn';

import {getSpringAuthorizationUrl, type SpringLoginResponse} from '../api/spring-auth-api';
import {AUTH_CALLBACK_URL} from './callback';
import {createCancelledAuthError, createProcessingAuthError} from './errors';
import {loginWithSpringAuthorizationCode} from './spring-session';

const OAUTH_CALLBACK_TIMEOUT_MS = 120_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OAuth request timed out.')), timeoutMs);
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
      reject(new Error('OAuth callback timed out.'));
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

export async function signInWithSpringOAuth(
  provider: 'kakao' | 'google',
): Promise<SpringLoginResponse> {
  try {
    const authUrl = await getSpringAuthorizationUrl(provider);
    if (new URL(authUrl).protocol !== 'https:') throw createProcessingAuthError();

    const callbackUrl = await openSpringOAuthCallback(authUrl);
    const code = getSpringOAuthCode(callbackUrl, provider);
    return await loginWithSpringAuthorizationCode(provider, code);
  } finally {
    InAppBrowser.closeAuth();
  }
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

export async function signInWithSpringApple(): Promise<SpringLoginResponse> {
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

    return await loginWithSpringAuthorizationCode(
      'apple',
      credential.authorizationCode,
      getSpringAppleFullName(credential.fullName),
    );
  } catch (error) {
    if ((error as {code?: string})?.code === appleAuth.Error.CANCELED) {
      throw createCancelledAuthError();
    }
    throw error;
  }
}
