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
/** SIGNED_IN에만 담깁니다. 서버가 신규 여부를 내리지 않으면 isNewMember는 undefined입니다. */
export type SpringSignInDetails = {isNewMember?: boolean};

export type SpringSessionListener = (
  event: SpringSessionEvent,
  memberId: string | null,
  details?: SpringSignInDetails,
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

function emit(
  event: SpringSessionEvent,
  memberId: string | null,
  details?: SpringSignInDetails,
): void {
  listeners.forEach(listener => {
    try {
      if (details) listener(event, memberId, details);
      else listener(event, memberId);
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
    emit('SIGNED_IN', session.memberId, {
      isNewMember:
        typeof response.isNewMember === 'boolean' ? response.isNewMember : undefined,
    });
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

const ROTATED_SESSION_POLL_MS = 300;
const ROTATED_SESSION_POLL_ATTEMPTS = 5;

/**
 * AUTH401_005는 다른 프로세스(공유 익스텐션)가 방금 같은 리프레시 토큰을 회전했다는 뜻입니다.
 * 그 프로세스가 새 토큰을 공유 저장소에 쓰기까지 잠시 기다렸다가 채택합니다. 끝내 보이지 않으면
 * 로그아웃하지 않고 다시 시도할 수 있는 오류로 알립니다.
 */
async function waitForRotatedSession(previousRefreshToken: string): Promise<SpringTokenPair> {
  for (let attempt = 0; attempt < ROTATED_SESSION_POLL_ATTEMPTS; attempt += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, ROTATED_SESSION_POLL_MS));
    const stored = await readStoredSession();
    if (stored && stored.refreshToken !== previousRefreshToken) {
      return toTokenPair(stored);
    }
  }

  throw new ApiError({
    kind: 'timeout',
    message: '로그인 정보를 확인하고 있어요. 잠시 후 다시 시도해주세요.',
  });
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
      const stored = await readStoredSession();
      if (stored && stored.refreshToken !== existing.refreshToken) {
        return toTokenPair(stored);
      }
      if (error.errorCode === 'AUTH401_005') {
        return waitForRotatedSession(existing.refreshToken);
      }
      await expireSpringSession(existing.memberId);
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

const LOGOUT_SERVER_TIMEOUT_MS = 5_000;

/** 로컬 인증 정보(앱 Keychain, 공유 익스텐션 세션 사본)를 지우지 못했을 때 던집니다. */
export class LocalSessionCleanupError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super('로컬 인증 정보를 지우지 못했어요.');
    this.name = 'LocalSessionCleanupError';
    this.cause = cause;
  }
}

export type SpringLogoutResult = {
  /** 서버가 세션 폐기를 확인했는지(2xx) 여부입니다. false면 리프레시 토큰이 서버에 남아 있을 수 있습니다. */
  serverConfirmed: boolean;
  serverError?: unknown;
};

/**
 * 앱 Keychain과 공유 익스텐션의 세션 사본(iOS App Group, Android 암호화 저장소)을 모두 지웁니다.
 * 공유 세션을 먼저 지워 익스텐션이 이전 계정으로 저장하지 않게 합니다.
 */
async function clearLocalSession(): Promise<void> {
  try {
    await syncShareSession(null);
    await clearSpringTokens();
  } catch (error) {
    throw new LocalSessionCleanupError(error);
  }
}

/** 서버 호출 없이 앱과 공유 익스텐션의 세션을 지웁니다. 회원탈퇴 뒤에 사용합니다. */
export async function clearSpringSession(): Promise<void> {
  const memberId = await getSpringMemberId().catch(() => null);
  await clearLocalSession();
  emit('SIGNED_OUT', memberId);
}

/**
 * 로컬 중심 로그아웃입니다. 서버 세션 폐기는 best-effort로 시도하고 결과만 돌려주며,
 * 실패해도 로컬 로그아웃을 막지 않습니다. 로컬 정리에 실패하면 로그아웃하지 않고
 * LocalSessionCleanupError를 던집니다.
 */
export async function logoutSpringSession(): Promise<SpringLogoutResult> {
  await refreshInFlight?.catch(() => undefined);
  const session = await readStoredSession().catch(() => null);

  let result: SpringLogoutResult = {serverConfirmed: false};
  if (session) {
    try {
      await revokeSpringSession(session.refreshToken, {timeoutMs: LOGOUT_SERVER_TIMEOUT_MS});
      result = {serverConfirmed: true};
    } catch (error) {
      result = {serverConfirmed: false, serverError: error};
    }
  }

  await clearLocalSession();
  emit('SIGNED_OUT', session?.memberId ?? null);
  return result;
}