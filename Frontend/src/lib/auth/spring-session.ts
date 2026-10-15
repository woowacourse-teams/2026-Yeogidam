import * as Keychain from 'react-native-keychain';

import {
  exchangeSpringAuthorizationCode,
  refreshSpringTokens,
  revokeSpringSession,
  type SpringLoginResponse,
  type SpringOAuthProvider,
  type SpringTokenPair,
} from '../api/spring-auth-api';
import {ApiError} from '../api/errors';

const KEYCHAIN_SERVICE = 'com.yeogidamm.app.spring-auth';
const REFRESH_EARLY_MS = 30_000;

let refreshInFlight: Promise<SpringTokenPair | null> | null = null;

function isSpringTokenPair(value: unknown): value is SpringTokenPair {
  if (!value || typeof value !== 'object') return false;
  const tokens = value as Partial<SpringTokenPair>;

  return (
    typeof tokens.accessToken === 'string' &&
    tokens.accessToken.length > 0 &&
    typeof tokens.refreshToken === 'string' &&
    tokens.refreshToken.length > 0 &&
    tokens.tokenType === 'Bearer' &&
    typeof tokens.expiresAt === 'string' &&
    Number.isFinite(Date.parse(tokens.expiresAt)) &&
    typeof tokens.refreshTokenExpiresAt === 'string' &&
    Number.isFinite(Date.parse(tokens.refreshTokenExpiresAt))
  );
}

function requireSpringTokenPair(value: unknown): SpringTokenPair {
  if (!isSpringTokenPair(value)) {
    throw new ApiError({
      kind: 'invalid_response',
      message: '로그인 응답을 처리하지 못했어요.',
    });
  }
  return value;
}

async function saveSpringTokens(tokens: SpringTokenPair): Promise<void> {
  await Keychain.setGenericPassword('spring-auth', JSON.stringify(tokens), {
    service: KEYCHAIN_SERVICE,
  });
}

export async function getSpringTokens(): Promise<SpringTokenPair | null> {
  const credentials = await Keychain.getGenericPassword({service: KEYCHAIN_SERVICE});
  if (!credentials) return null;

  try {
    const value: unknown = JSON.parse(credentials.password);
    return isSpringTokenPair(value) ? value : null;
  } catch {
    return null;
  }
}

export async function clearSpringTokens(): Promise<void> {
  await Keychain.resetGenericPassword({service: KEYCHAIN_SERVICE});
}

export async function loginWithSpringAuthorizationCode(
  provider: SpringOAuthProvider,
  authorizationCode: string,
  fullName?: string | null,
): Promise<SpringLoginResponse> {
  const response = await exchangeSpringAuthorizationCode(
    provider,
    authorizationCode,
    fullName,
  );
  const tokens = requireSpringTokenPair(response);
  await saveSpringTokens({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: tokens.tokenType,
    expiresAt: tokens.expiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  });
  return response;
}

async function rotateSpringTokens(): Promise<SpringTokenPair | null> {
  const existing = await getSpringTokens();
  if (!existing) return null;

  try {
    const updated = requireSpringTokenPair(
      await refreshSpringTokens(existing.refreshToken),
    );
    const stored = await getSpringTokens();
    if (stored?.refreshToken !== existing.refreshToken) return stored;

    await saveSpringTokens(updated);
    return updated;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const stored = await getSpringTokens();
      if (stored?.refreshToken !== existing.refreshToken) return stored;
      if (error.errorCode !== 'AUTH401_005') await clearSpringTokens();
    }
    throw error;
  }
}

/** 여러 요청이 동시에 만료된 토큰을 만나도 리프레시 토큰은 한 번만 회전합니다. */
export function refreshSpringSession(): Promise<SpringTokenPair | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = rotateSpringTokens().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function getSpringAccessToken(): Promise<string | null> {
  if (refreshInFlight) return (await refreshInFlight)?.accessToken ?? null;

  const tokens = await getSpringTokens();
  if (!tokens) return null;
  if (Date.parse(tokens.expiresAt) > Date.now() + REFRESH_EARLY_MS) {
    return tokens.accessToken;
  }

  return (await refreshSpringSession())?.accessToken ?? null;
}

export async function logoutSpringSession(): Promise<void> {
  await refreshInFlight;
  const tokens = await getSpringTokens();
  if (!tokens) return;

  await revokeSpringSession(tokens.refreshToken);
  const stored = await getSpringTokens();
  if (stored?.refreshToken === tokens.refreshToken) await clearSpringTokens();
}
