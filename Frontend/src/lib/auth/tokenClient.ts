import { createApiClient, type ApiRequest } from '../api/client';
import { ApiError, createNetworkApiError, toApiError } from '../api/errors';
import { parseServerDateTime, toIdString } from '../api/values';
import {
  ensureNativeAccessToken,
  type NativeAccessTokenResult,
  type NativeShareSession,
} from '../share-intent';
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession,
} from './authStorage';

/** 액세스 토큰의 만료가 60초 안으로 다가오면 미리 갱신합니다. 공유 확장과 같은 값입니다. */
const REFRESH_MARGIN_SECONDS = 60;

/** 토큰 재발급 응답입니다. 로그인 응답은 같은 다섯 필드에 회원 정보를 더해 내려 줍니다. */
export type ServerTokenResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  /** ISO-8601 UTC이며 초 단위로 잘려 있습니다. */
  expiresAt: string;
  /** 재발급해도 늘어나지 않는 세션 만료 시각입니다. */
  refreshTokenExpiresAt: string;
};

export type TokenClientOptions = {
  /** 서버 주소입니다. 경로 `/api/v1` 앞까지 받습니다. */
  baseUrl: string;
};

type AuthStateListener = (signedIn: boolean) => void;

let request: ApiRequest | null = null;
let refreshing: Promise<NativeAccessTokenResult> | null = null;
const listeners = new Set<AuthStateListener>();

/** 앱 시작 때 configureDataSources가 한 번 부릅니다. 부르기 전에는 서버에 가지 않습니다. */
export function configureTokenClient(options: TokenClientOptions) {
  // 재발급과 로그아웃은 액세스 토큰을 싣지 않으므로 토큰 접근자 없이 만듭니다.
  request = createApiClient({ baseUrl: options.baseUrl });
}

function isUsable(session: NativeShareSession) {
  return (
    session.accessToken.length > 0 &&
    session.expiresAt > Date.now() / 1000 + REFRESH_MARGIN_SECONDS
  );
}

/** 공유 저장소 모양으로 바꿉니다. expiresAt은 epoch 초, userId 자리에는 회원 id 문자열이 들어갑니다. */
function toSession(
  tokens: ServerTokenResponse,
  userId: string,
): NativeShareSession {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: parseServerDateTime(tokens.expiresAt).getTime() / 1000,
    userId,
  };
}

function notifyAuthState(signedIn: boolean) {
  listeners.forEach(listener => listener(signedIn));
}

/** 서버가 세션을 끝낸 재발급 실패입니다. 429, 5xx, 네트워크 오류는 세션을 그대로 둡니다. */
function isSessionEnded(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.errorCode === 'AUTH401_001' || error.errorCode === 'AUTH401_003')
  );
}

/**
 * 세션을 둔 채 끝난 재발급 실패를 요청 쪽에 돌려줄 오류로 바꿉니다. 네이티브 결과에는 상태 코드가
 * 없어서, 네트워크 오류가 아니면 본문 없는 503(DATA500_001, "잠시 후 다시 시도")으로 둡니다.
 */
function toRefreshFailure(result: NativeAccessTokenResult): ApiError {
  return result.status === 'WAITING_FOR_NETWORK'
    ? createNetworkApiError()
    : toApiError(503, null, null);
}

/** 네이티브 갱신 진입점이 없는 바이너리에서 쓰는 갱신입니다. 결과 모양은 네이티브와 같습니다. */
async function refreshInJs(): Promise<NativeAccessTokenResult> {
  const session = await loadAuthSession();

  if (!session) {
    return { status: 'LOGIN_REQUIRED' };
  }

  if (!request) {
    return { status: 'WAITING_FOR_AUTH' };
  }

  try {
    const tokens = (await request('/api/v1/auth/token-refreshes', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    })) as ServerTokenResponse;
    await saveAuthSession(toSession(tokens, session.userId));

    return { status: 'READY', accessToken: tokens.accessToken };
  } catch (error) {
    if (isSessionEnded(error)) {
      await clearAuthSession();

      return { status: 'LOGIN_REQUIRED' };
    }

    return error instanceof ApiError && error.status === null
      ? { status: 'WAITING_FOR_NETWORK' }
      : { status: 'WAITING_FOR_AUTH' };
  }
}

async function ensureAccessToken(
  rejectedAccessToken: string | null,
): Promise<NativeAccessTokenResult> {
  let result: NativeAccessTokenResult;

  try {
    result =
      (await ensureNativeAccessToken(rejectedAccessToken)) ??
      (await refreshInJs());
  } catch {
    // 브리지 호출이 실패하면 세션을 둔 채 다음 요청에서 다시 갱신합니다.
    result = { status: 'WAITING_FOR_AUTH' };
  }

  if (result.status === 'LOGIN_REQUIRED') {
    notifyAuthState(false);
  }

  return result;
}

/** 앱 안에서 동시에 생긴 갱신은 먼저 시작한 하나를 함께 기다립니다. */
function refreshTokens(
  rejectedAccessToken: string | null,
): Promise<NativeAccessTokenResult> {
  if (!refreshing) {
    refreshing = ensureAccessToken(rejectedAccessToken).finally(() => {
      refreshing = null;
    });
  }

  return refreshing;
}

/**
 * 요청에 실을 액세스 토큰을 돌려줍니다. 만료 60초 전부터는 갱신한 토큰을 돌려주고, 세션이 없거나
 * 서버가 세션을 끝냈으면 null입니다. 갱신이 429, 5xx, 네트워크 오류로 실패하면 저장된 토큰을
 * 그대로 돌려주어 요청을 계속 보냅니다. 던지지 않습니다.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await loadAuthSession();

  if (!session) {
    return null;
  }

  if (isUsable(session)) {
    return session.accessToken;
  }

  const result = await refreshTokens(null);

  if (result.status === 'READY') {
    return result.accessToken;
  }

  return result.status === 'LOGIN_REQUIRED'
    ? null
    : session.accessToken || null;
}

/**
 * 서버가 액세스 토큰을 거절했을 때(AUTH401_001) 부르며, 새 토큰이 준비되면 true입니다. 거절된
 * 토큰을 넘기면, 다른 요청이 먼저 갱신해 저장소의 토큰이 바뀐 경우 서버에 가지 않습니다.
 * 서버가 재발급을 거절해 세션을 지웠으면(AUTH401_001, AUTH401_003) false이고, 429, 5xx,
 * 네트워크 오류처럼 세션을 둔 채 실패하면 재발급 실패를 던져 요청 쪽이 원래의 401 대신 받게 합니다.
 */
export async function refreshSession(
  rejectedAccessToken?: string,
): Promise<boolean> {
  const session = await loadAuthSession();

  if (!session) {
    return false;
  }

  if (
    rejectedAccessToken !== undefined &&
    session.accessToken !== rejectedAccessToken &&
    isUsable(session)
  ) {
    return true;
  }

  const result = await refreshTokens(session.accessToken);

  if (result.status === 'LOGIN_REQUIRED') {
    return false;
  }

  if (result.status !== 'READY') {
    throw toRefreshFailure(result);
  }

  return true;
}

/** 로그인 응답의 토큰 쌍과 회원 id를 저장하고 구독자에게 로그인을 알립니다. 로그인 경로가 부릅니다. */
export async function startSession(
  tokens: ServerTokenResponse,
  memberId: number,
): Promise<void> {
  await saveAuthSession(toSession(tokens, toIdString(memberId)));
  notifyAuthState(true);
}

/**
 * 기기의 세션을 먼저 지우고 서버에 세션 종료를 알립니다. 서버 호출은 최선 노력이라 실패해도
 * (만료된 리프레시 토큰의 401, 네트워크 오류 등) 로그아웃은 끝나며, 던지지 않습니다.
 */
export async function logout(): Promise<void> {
  // 진행 중인 갱신이 끝난 뒤에 지워야 갱신 결과가 지운 세션을 되살리지 않습니다.
  await refreshing;

  const session = await loadAuthSession();
  await clearAuthSession();
  notifyAuthState(false);

  if (!session || !request) {
    return;
  }

  try {
    await request('/api/v1/auth/logouts', {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    });
  } catch {
    // 서버가 세션을 끝내지 못해도 기기에서는 이미 로그아웃했습니다.
  }
}

/** 로그인 상태가 바뀌면 부릅니다. 로그인하면 true, 로그아웃하거나 서버가 세션을 끝내면 false입니다. */
export function subscribeAuthState(listener: AuthStateListener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
