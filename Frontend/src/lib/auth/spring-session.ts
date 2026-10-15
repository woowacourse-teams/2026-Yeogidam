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
import {withAuthErrorStage} from './errors';
import {
  getShareSession,
  syncShareSession,
  type NativeShareSession,
} from '../share-intent';

const KEYCHAIN_SERVICE = 'com.yeogidamm.app.spring-auth';
const REFRESH_EARLY_MS = 30_000;

export type SpringSessionEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';
export type SpringSessionListener = (
  event: SpringSessionEvent,
  memberId: string | null,
) => void;

/** Keychain 레코드는 토큰 쌍과 함께 공유 익스텐션 세션 대조용 회원 ID를 보관합니다. */
type StoredSpringSession = SpringTokenPair & {memberId: string | null};

const listeners = new Set<SpringSessionListener>();
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

function toTokenPair(session: SpringTokenPair): SpringTokenPair {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    tokenType: session.tokenType,
    expiresAt: session.expiresAt,
    refreshTokenExpiresAt: session.refreshTokenExpiresAt,
  };
}

function toNativeShareSession(session: StoredSpringSession): NativeShareSession | null {
  if (!session.memberId) return null;
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: Math.floor(Date.parse(session.expiresAt) / 1000),
    userId: session.memberId,
  };
}

function emit(event: SpringSessionEvent, memberId: string | null): void {
  listeners.forEach(listener => {
    try {
      listener(event, memberId);
    } catch {
      // 구독자 오류가 세션 저장 흐름을 막지 않게 합니다.
    }
  });
}

/** 공유 익스텐션 동기화는 실패해도 앱 세션을 유지합니다. */
async function syncNativeShareSession(session: StoredSpringSession | null): Promise<void> {
  if (session && !session.memberId) return;
  await syncShareSession(session ? toNativeShareSession(session) : null).catch(
    () => undefined,
  );
}

async function readStoredRecord(): Promise<StoredSpringSession | null> {
  const credentials = await Keychain.getGenericPassword({service: KEYCHAIN_SERVICE});
  if (!credentials) return null;

  try {
    const value: unknown = JSON.parse(credentials.password);
    if (!isSpringTokenPair(value)) return null;
    const memberId = (value as {memberId?: unknown}).memberId;
    return {
      ...toTokenPair(value),
      memberId: typeof memberId === 'string' && memberId ? memberId : null,
    };
  } catch {
    return null;
  }
}

async function saveStoredRecord(session: StoredSpringSession): Promise<void> {
  await Keychain.setGenericPassword('spring-auth', JSON.stringify(session), {
    service: KEYCHAIN_SERVICE,
  });
}

/**
 * 공유 익스텐션이 먼저 리프레시 토큰을 회전했다면 같은 회원의 더 늦게 만료되는
 * 토큰을 앱 저장소로 가져옵니다. 그대로 두면 앱이 낡은 토큰을 보내 재사용으로 판정됩니다.
 */
async function adoptNativeShareSession(
  stored: StoredSpringSession,
): Promise<StoredSpringSession> {
  if (!stored.memberId) return stored;

  const shared = await getShareSession().catch(() => null);
  if (
    !shared ||
    shared.userId !== stored.memberId ||
    !shared.accessToken ||
    !shared.refreshToken ||
    shared.refreshToken === stored.refreshToken ||
    !(shared.expiresAt * 1000 > Date.parse(stored.expiresAt))
  ) {
    return stored;
  }

  const adopted: StoredSpringSession = {
    ...stored,
    accessToken: shared.accessToken,
    refreshToken: shared.refreshToken,
    expiresAt: new Date(shared.expiresAt * 1000).toISOString(),
  };
  await saveStoredRecord(adopted);
  emit('TOKEN_REFRESHED', adopted.memberId);
  return adopted;
}

async function readStoredSession(): Promise<StoredSpringSession | null> {
  const stored = await readStoredRecord();
  return stored ? adoptNativeShareSession(stored) : null;
}

export async function getSpringTokens(): Promise<SpringTokenPair | null> {
  const session = await readStoredSession();
  return session ? toTokenPair(session) : null;
}

export async function getSpringMemberId(): Promise<string | null> {
  return (await readStoredRecord())?.memberId ?? null;
}

export function onSpringSessionChange(listener: SpringSessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function clearSpringTokens(): Promise<void> {
  await Keychain.resetGenericPassword({service: KEYCHAIN_SERVICE});
}

/** 서버 호출 없이 앱과 공유 익스텐션의 세션을 지웁니다. 회원탈퇴 뒤에 사용합니다. */
export async function clearSpringSession(): Promise<void> {
  const memberId = await getSpringMemberId().catch(() => null);
  await syncNativeShareSession(null);
  await clearSpringTokens();
  emit('SIGNED_OUT', memberId);
}

export async function loginWithSpringAuthorizationCode(
  provider: SpringOAuthProvider,
  authorizationCode: string,
  fullName?: string | null,
): Promise<SpringLoginResponse> {
  let response: SpringLoginResponse;
  try {
    response = await exchangeSpringAuthorizationCode(
      provider,
      authorizationCode,
      fullName,
    );
  } catch (error) {
    throw withAuthErrorStage(error, 'backend_exchange');
  }

  try {
    const tokens = requireSpringTokenPair(response);
    const session: StoredSpringSession = {
      ...toTokenPair(tokens),
      memberId: response.member?.id != null ? String(response.member.id) : null,
    };
    await saveStoredRecord(session);
    await syncNativeShareSession(session);
    emit('SIGNED_IN', session.memberId);
    return response;
  } catch (error) {
    throw withAuthErrorStage(error, 'session_persist');
  }
}

async function expireSpringSession(memberId: string | null): Promise<void> {
  await syncNativeShareSession(null);
  await clearSpringTokens();
  emit('SIGNED_OUT', memberId);
}

async function rotateSpringTokens(): Promise<SpringTokenPair | null> {
  const existing = await readStoredSession();
  if (!existing) return null;

  try {
    const updated = requireSpringTokenPair(
      await refreshSpringTokens(existing.refreshToken),
    );
    const stored = await readStoredSession();
    if (stored?.refreshToken !== existing.refreshToken) {
      return stored ? toTokenPair(stored) : null;
    }

    const session: StoredSpringSession = {
      ...toTokenPair(updated),
      memberId: existing.memberId,
    };
    await saveStoredRecord(session);
    await syncNativeShareSession(session);
    emit('TOKEN_REFRESHED', session.memberId);
    return toTokenPair(session);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // AUTH401_005는 다른 프로세스가 방금 회전한 경우라 저장소를 다시 읽습니다.
      const stored = await readStoredSession();
      if (stored && stored.refreshToken !== existing.refreshToken) {
        return toTokenPair(stored);
      }
      if (error.errorCode !== 'AUTH401_005') {
        await expireSpringSession(existing.memberId);
      }
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

/**
 * 공유 익스텐션이 폐기될 토큰으로 요청하지 않도록 공유 세션을 먼저 지운 뒤 서버 세션을 끝냅니다.
 * 서버 호출이 실패하면 공유 세션을 되돌리고 오류를 전달합니다.
 */
export async function logoutSpringSession(): Promise<void> {
  await refreshInFlight?.catch(() => undefined);
  const session = await readStoredSession();
  if (!session) {
    await syncNativeShareSession(null);
    emit('SIGNED_OUT', null);
    return;
  }

  const sharedSnapshot = await getShareSession().catch(() => null);
  await syncNativeShareSession(null);

  try {
    await revokeSpringSession(session.refreshToken);
  } catch (error) {
    // 이미 무효인 리프레시 토큰이면 서버 세션도 끝난 상태라 로컬 정리만 진행합니다.
    if (!(error instanceof ApiError && error.status === 401)) {
      if (sharedSnapshot) {
        await syncShareSession(sharedSnapshot).catch(() => undefined);
      }
      throw error;
    }
  }

  const stored = await readStoredRecord();
  if (stored && stored.memberId === session.memberId) await clearSpringTokens();
  emit('SIGNED_OUT', session.memberId);
}
