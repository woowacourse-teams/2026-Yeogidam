import {Linking} from 'react-native';
import {InAppBrowser} from 'react-native-inappbrowser-reborn';

import {
  getAuthorizationUrl,
  loginWithAuthorizationCode,
  type LoginProvider,
} from './loginApi';
import {
  createCancelledAuthError,
  createProcessingAuthError,
  normalizeAuthError,
} from './errors';

/** 서버 콜백이 인가 코드를 실어 돌려보내는 앱 스킴 주소입니다. 서버 설정의 앱 콜백 주소와 같아야 합니다. */
export const AUTH_CALLBACK_URL = 'com.yeogidamm.app://auth-callback';

const OAUTH_REQUEST_TIMEOUT_MS = 15_000;
const BROWSER_CALLBACK_TIMEOUT_MS = 120_000;

export type SupportedOAuthProvider = Exclude<LoginProvider, 'apple'>;

class TimeoutError extends Error {
  constructor() {
    super('OAuth request timed out.');
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

function mergeUrlParams(url: string) {
  const callbackUrl = new URL(url);
  const params = new URLSearchParams(callbackUrl.search);
  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));

  hashParams.forEach((value, key) => {
    if (!params.has(key)) {
      params.set(key, value);
    }
  });

  return params;
}

/**
 * 서버 콜백이 넘긴 앱 스킴 주소에서 인가 코드를 꺼냅니다. 제공자가 error로 돌려보냈으면 로그인을 이어 가지
 * 않으며, 사용자가 거절한 access_denied는 취소로, 나머지는 처리 오류로 던집니다. 요청한 제공자의
 * 주소가 아니거나 코드가 없어도 처리 오류입니다.
 */
export function getAuthorizationCodeFromCallback(
  url: string,
  provider: SupportedOAuthProvider,
): string {
  const params = mergeUrlParams(url);

  if (params.get('provider') !== provider) {
    throw createProcessingAuthError();
  }

  const callbackError = params.get('error');

  if (callbackError) {
    throw callbackError === 'access_denied'
      ? createCancelledAuthError()
      : createProcessingAuthError();
  }

  const code = params.get('code');

  if (!code) {
    throw createProcessingAuthError();
  }

  return code;
}

async function waitForDeepLinkFallback(authUrl: string) {
  return new Promise<{type: 'success'; url: string}>((resolve, reject) => {
    const subscription = Linking.addEventListener('url', ({url}) => {
      subscription.remove();
      resolve({type: 'success', url});
    });

    Linking.openURL(authUrl).catch(error => {
      subscription.remove();
      reject(error);
    });
  });
}

async function openAuthSession(authUrl: string) {
  if (await InAppBrowser.isAvailable()) {
    return InAppBrowser.openAuth(authUrl, AUTH_CALLBACK_URL, {
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
    });
  }

  return withTimeout(waitForDeepLinkFallback(authUrl), BROWSER_CALLBACK_TIMEOUT_MS);
}

/** 서버가 만든 제공자 로그인 주소를 인앱 브라우저로 열고, 서버 콜백이 앱 스킴으로 넘긴 인가 코드를 받습니다. */
async function receiveAuthorizationCode(provider: SupportedOAuthProvider) {
  const authorizationUrl = await withTimeout(
    getAuthorizationUrl(provider),
    OAUTH_REQUEST_TIMEOUT_MS,
  );
  const authSessionResult = await withTimeout(
    openAuthSession(authorizationUrl),
    BROWSER_CALLBACK_TIMEOUT_MS,
  );

  if (authSessionResult.type !== 'success') {
    throw createCancelledAuthError();
  }

  return getAuthorizationCodeFromCallback(authSessionResult.url, provider);
}

export async function signInWithOAuth(
  provider: SupportedOAuthProvider,
): Promise<void> {
  try {
    const authorizationCode = await receiveAuthorizationCode(provider);

    await withTimeout(
      loginWithAuthorizationCode(provider, {authorizationCode}),
      OAUTH_REQUEST_TIMEOUT_MS,
    );
  } catch (error) {
    throw normalizeAuthError(error);
  } finally {
    InAppBrowser.closeAuth();
  }
}

/**
 * 회원탈퇴 재인증입니다. 로그인과 같은 창에서 인가 코드만 받아 돌려주며, 코드는 한 번만 쓸 수 있어
 * 로그인에 보내지 않습니다.
 */
export async function reauthenticateWithOAuth(
  provider: SupportedOAuthProvider,
): Promise<string> {
  try {
    return await receiveAuthorizationCode(provider);
  } catch (error) {
    throw normalizeAuthError(error);
  } finally {
    InAppBrowser.closeAuth();
  }
}
