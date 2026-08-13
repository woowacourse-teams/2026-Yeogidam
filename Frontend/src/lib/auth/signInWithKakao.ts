import {Linking} from 'react-native';
import type {Session} from '@supabase/supabase-js';
import {InAppBrowser} from 'react-native-inappbrowser-reborn';

import {AUTH_CALLBACK_URL, supabase} from './supabase';
import {
  createCancelledAuthError,
  createProcessingAuthError,
  normalizeAuthError,
} from './errors';

const OAUTH_REQUEST_TIMEOUT_MS = 15_000;
const BROWSER_CALLBACK_TIMEOUT_MS = 120_000;

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

function getCallbackError(url: string) {
  const params = mergeUrlParams(url);
  const errorCode = params.get('error_code');

  if (!errorCode) {
    return null;
  }

  if (errorCode.startsWith('4')) {
    return {
      status: 400,
    };
  }

  if (errorCode.startsWith('5')) {
    return {
      status: 502,
    };
  }

  return createProcessingAuthError();
}

async function waitForDeepLinkFallback(authUrl: string) {
  return new Promise<{type: 'success'; url: string}>((resolve, reject) => {
    const subscription = Linking.addEventListener('url', ({url}) => {
      subscription.remove();
      resolve({type: 'success', url});
    });

    Linking.openURL(authUrl).catch(reject);
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

function getAuthCodeFromUrl(url: string) {
  return mergeUrlParams(url).get('code');
}

export async function signInWithKakao(): Promise<Session> {
  try {
    const {data, error} = await withTimeout(
      supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: AUTH_CALLBACK_URL,
          skipBrowserRedirect: true,
        },
      }),
      OAUTH_REQUEST_TIMEOUT_MS,
    );

    if (error || !data?.url) {
      throw error ?? createProcessingAuthError();
    }

    const authSessionResult = await withTimeout(
      openAuthSession(data.url),
      BROWSER_CALLBACK_TIMEOUT_MS,
    );

    if (authSessionResult.type !== 'success') {
      throw createCancelledAuthError();
    }

    const callbackError = getCallbackError(authSessionResult.url);
    if (callbackError) {
      throw callbackError;
    }

    const code = getAuthCodeFromUrl(authSessionResult.url);
    if (!code) {
      throw createProcessingAuthError();
    }

    const {data: sessionData, error: exchangeError} = await withTimeout(
      supabase.auth.exchangeCodeForSession(code),
      OAUTH_REQUEST_TIMEOUT_MS,
    );

    if (exchangeError || !sessionData.session) {
      throw exchangeError ?? createProcessingAuthError();
    }

    return sessionData.session;
  } catch (error) {
    throw normalizeAuthError(error);
  } finally {
    InAppBrowser.closeAuth();
  }
}
