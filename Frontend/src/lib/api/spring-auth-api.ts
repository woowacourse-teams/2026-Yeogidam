import {createApiClient} from './client';

const client = createApiClient();

export type SpringOAuthProvider = 'kakao' | 'google' | 'apple';

export type SpringTokenPair = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: string;
  refreshTokenExpiresAt: string;
};

export type SpringMember = {
  id: number;
  nickname: string | null;
  email: string | null;
  imageUrl: string | null;
  oauthProvider: 'KAKAO' | 'GOOGLE' | 'APPLE';
};

export type SpringLoginResponse = SpringTokenPair & {
  member: SpringMember;
};

export async function getSpringAuthorizationUrl(
  provider: 'kakao' | 'google',
): Promise<string> {
  const response = await client.request<{authorizationUrl: string}>(
    `/oauth/${provider}/authorize`,
    {auth: 'none'},
  );
  return response.authorizationUrl;
}

export function exchangeSpringAuthorizationCode(
  provider: SpringOAuthProvider,
  authorizationCode: string,
  fullName?: string | null,
): Promise<SpringLoginResponse> {
  return client.request<SpringLoginResponse>(`/api/v1/auth/logins/${provider}`, {
    method: 'POST',
    auth: 'none',
    body: {
      authorizationCode,
      ...(provider === 'apple' && fullName ? {fullName} : {}),
    },
  });
}

export function refreshSpringTokens(refreshToken: string): Promise<SpringTokenPair> {
  return client.request<SpringTokenPair>('/api/v1/auth/token-refreshes', {
    method: 'POST',
    auth: 'none',
    body: {refreshToken},
  });
}

export function revokeSpringSession(
  refreshToken: string,
  options: {timeoutMs?: number} = {},
): Promise<void> {
  return client.request<void>('/api/v1/auth/logouts', {
    method: 'POST',
    auth: 'none',
    body: {refreshToken},
    ...(options.timeoutMs ? {timeoutMs: options.timeoutMs} : {}),
  });
}
