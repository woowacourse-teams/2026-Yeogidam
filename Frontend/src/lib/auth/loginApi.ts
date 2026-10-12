import {
  createApiClient,
  type ApiClientOptions,
  type ApiRequest,
} from '../api/client';
import { createProcessingAuthError } from './errors';
import { startSession, type ServerTokenResponse } from './tokenClient';

/** 서버 로그인 경로에 들어가는 제공자 값입니다. 회원 정보의 oauthProvider와 달리 소문자입니다. */
export type LoginProvider = 'kakao' | 'google' | 'apple';

/** 로그인 응답입니다. 토큰 다섯 필드는 재발급 응답과 같고, 회원 정보는 세션에 저장할 id만 읽습니다. */
type ServerLoginResponse = ServerTokenResponse & {
  member: { id: number };
};

type AuthorizationUrlResponse = {
  authorizationUrl: string;
};

let request: ApiRequest | null = null;

/** 앱 시작 때 configureDataSources가 부릅니다. 로그인 전에 부르는 경로라 토큰을 싣지 않습니다. */
export function configureLoginApi(options: ApiClientOptions) {
  request = createApiClient(options);
}

function getLoginRequest(): ApiRequest {
  if (!request) {
    // 서버 주소가 없는 목 모드에는 로그인할 서버가 없습니다.
    throw createProcessingAuthError();
  }

  return request;
}

/** 서버가 state를 넣어 만든 제공자 로그인 주소를 받습니다. state가 10분 뒤 만료되므로 로그인마다 새로 받습니다. */
export async function getAuthorizationUrl(
  provider: Exclude<LoginProvider, 'apple'>,
): Promise<string> {
  const body = (await getLoginRequest()(`/oauth/${provider}/authorize`)) as
    | AuthorizationUrlResponse
    | undefined;

  if (typeof body?.authorizationUrl !== 'string') {
    throw createProcessingAuthError();
  }

  return body.authorizationUrl;
}

/**
 * 인가 코드로 서버에 로그인하고 받은 토큰 쌍을 토큰 클라이언트에 저장합니다. 처음 로그인한 계정은 서버가
 * 회원으로 등록합니다. fullName은 애플만 보냅니다.
 */
export async function loginWithAuthorizationCode(
  provider: LoginProvider,
  body: { authorizationCode: string; fullName?: string },
): Promise<void> {
  const response = (await getLoginRequest()(`/api/v1/auth/logins/${provider}`, {
    method: 'POST',
    body,
  })) as ServerLoginResponse;

  await startSession(response, response.member.id);
}
