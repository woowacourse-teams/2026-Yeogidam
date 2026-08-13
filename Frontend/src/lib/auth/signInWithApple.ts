import type {Session} from '@supabase/supabase-js';
import {Platform} from 'react-native';
import {appleAuth} from '@invertase/react-native-apple-authentication';
import {sha256} from 'js-sha256';

import {
  createCancelledAuthError,
  createProcessingAuthError,
  normalizeAuthError,
} from './errors';
import {supabase} from './supabase';

const APPLE_AUTH_TIMEOUT_MS = 120_000;
const SUPABASE_AUTH_TIMEOUT_MS = 15_000;

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

function createNonce() {
  const globalWithCrypto = globalThis as typeof globalThis & {
    crypto?: {getRandomValues?: (array: Uint8Array) => Uint8Array};
  };
  const cryptoObject = globalWithCrypto.crypto;

  if (typeof cryptoObject?.getRandomValues === 'function') {
    const randomBytes = new Uint8Array(16);
    cryptoObject.getRandomValues(randomBytes);

    return Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  return `nonce-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function getAppleFullNameData(
  fullName: Awaited<ReturnType<typeof appleAuth.performRequest>>['fullName'],
) {
  if (!fullName) {
    return null;
  }

  const givenName = fullName.givenName?.trim();
  const familyName = fullName.familyName?.trim();
  const fullNameValue = [familyName, givenName].filter(Boolean).join('');

  if (!givenName && !familyName && !fullNameValue) {
    return null;
  }

  return {
    ...(fullNameValue ? {full_name: fullNameValue} : {}),
    ...(givenName ? {given_name: givenName} : {}),
    ...(familyName ? {family_name: familyName} : {}),
  };
}

async function saveAppleFullName(
  fullName: Awaited<ReturnType<typeof appleAuth.performRequest>>['fullName'],
) {
  const metadata = getAppleFullNameData(fullName);

  if (!metadata) {
    return;
  }

  await withTimeout(
    supabase.auth.updateUser({
      data: metadata,
    }),
    SUPABASE_AUTH_TIMEOUT_MS,
  ).catch(() => {});
}

export const isAppleSignInSupported =
  Platform.OS === 'ios' && appleAuth.isSupported;

export async function signInWithApple(): Promise<Session> {
  if (!isAppleSignInSupported) {
    throw createProcessingAuthError();
  }

  try {
    const rawNonce = createNonce();
    const hashedNonce = sha256(rawNonce);

    const credential = await withTimeout(
      appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
        nonce: hashedNonce,
        nonceEnabled: false,
      }),
      APPLE_AUTH_TIMEOUT_MS,
    );

    if (!credential.identityToken) {
      throw createProcessingAuthError();
    }

    const {data, error} = await withTimeout(
      supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      }),
      SUPABASE_AUTH_TIMEOUT_MS,
    );

    if (error || !data.session) {
      throw error ?? createProcessingAuthError();
    }

    await saveAppleFullName(credential.fullName);

    return data.session;
  } catch (error) {
    const appleError = error as {code?: string} | null;

    if (appleError?.code === appleAuth.Error.CANCELED) {
      throw createCancelledAuthError();
    }

    throw normalizeAuthError(error);
  }
}
