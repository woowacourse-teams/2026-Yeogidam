import type {SpringMember} from '../api/spring-auth-api';
import {createSpringApiClient} from '../api/spring-client';
import {ApiError} from '../api/errors';
import {normalizeAuthError, type NormalizedAuthError} from './errors';
import {
  getSpringAppleCredential,
  getSpringOAuthAuthorizationCode,
} from './spring-sign-in';

const DELETE_ACCOUNT_TIMEOUT_MS = 10_000;

const client = createSpringApiClient();

export type AccountDeletionProvider = 'apple' | 'google' | 'kakao';

/**
 * 탈퇴 화면 계약입니다. Spring 서버는 회원의 소셜 제공자 인가 코드 하나만 받으므로
 * 카카오/구글은 providerTokens에, 애플은 appleAuthorizationCode에 인가 코드를 담습니다.
 */
export type DeleteAccountRequest = {
  confirmation: 'DELETE';
  providerTokens?: {
    google?: string;
    kakao?: string;
  };
  appleAuthorizationCode?: string;
};

export type DeleteAccountError = {
  status: number | null;
  errorCode: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  details?: {
    field?: string;
  };
};

const deletionError = (
  errorCode: string,
  status: number | null,
  message: string,
  retryable: boolean,
): DeleteAccountError => ({
  status,
  errorCode,
  message,
  retryable,
});

function fallbackDeleteAccountError(status: number | null): DeleteAccountError {
  if (status === 400) {
    return deletionError(
      'COMMON400_001',
      400,
      '요청 내용을 확인해주세요.',
      false,
    );
  }

  if (status === 401) {
    return deletionError('AUTH401_001', 401, '로그인이 필요해요.', true);
  }

  if (status === 502) {
    return deletionError(
      'USER502_001',
      502,
      '연결된 로그인 계정을 해제하지 못했어요.',
      true,
    );
  }

  if (status !== null && status >= 500) {
    return deletionError(
      'COMMON500_001',
      500,
      '처리 중 문제가 생겼어요.',
      true,
    );
  }

  return deletionError(
    'CLIENT000_003',
    null,
    '응답을 처리하지 못했어요.',
    false,
  );
}

function createDeleteAccountReauthError(): DeleteAccountError {
  return deletionError(
    'USER401_001',
    401,
    '계정 보호를 위해 다시 로그인해주세요.',
    true,
  );
}

function toDeleteAccountAuthError(
  error: NormalizedAuthError,
): DeleteAccountError {
  if (error.errorCode === 'AUTH000_001') {
    return {
      ...error,
      errorCode: 'USER401_001',
      message: '계정 보호를 위해 다시 로그인해주세요.',
    };
  }

  if (error.errorCode === 'AUTH400_001') {
    return createDeleteAccountReauthError();
  }

  if (error.errorCode === 'AUTH502_001') {
    return deletionError(
      'USER502_001',
      502,
      '연결된 로그인 계정을 해제하지 못했어요.',
      true,
    );
  }

  return {
    status: error.status,
    errorCode: error.errorCode,
    message: error.message,
    retryable: error.retryable,
    requestId: error.requestId,
  };
}

function toDeleteAccountApiError(error: unknown): DeleteAccountError {
  if (!(error instanceof ApiError)) return fallbackDeleteAccountError(null);

  if (error.kind === 'timeout') {
    return deletionError(
      'CLIENT000_002',
      null,
      '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
      true,
    );
  }
  if (error.kind === 'network') {
    return deletionError('CLIENT000_001', null, '인터넷 연결을 확인해주세요.', true);
  }
  if (error.kind === 'auth') return fallbackDeleteAccountError(401);
  if (error.kind !== 'http') return fallbackDeleteAccountError(null);

  const status = error.status ?? null;
  // 서버가 인가 코드를 거절하면 사용자가 다시 인증해야 합니다.
  if (error.errorCode === 'AUTH401_002') return createDeleteAccountReauthError();

  const fallback = fallbackDeleteAccountError(status);
  return {
    ...fallback,
    status: status ?? fallback.status,
    errorCode: error.errorCode ?? fallback.errorCode,
    message: error.errorCode ? error.message : fallback.message,
  };
}

export function getLinkedDeletionProviders(
  oauthProvider: SpringMember['oauthProvider'] | null | undefined,
): AccountDeletionProvider[] {
  switch (oauthProvider) {
    case 'APPLE':
      return ['apple'];
    case 'GOOGLE':
      return ['google'];
    case 'KAKAO':
      return ['kakao'];
    default:
      return [];
  }
}

/** 로그인 API를 부르지 않고 탈퇴용 제공자 인가 코드만 받습니다. */
export async function reauthenticateDeletionProvider(
  provider: AccountDeletionProvider,
): Promise<DeleteAccountRequest> {
  try {
    if (provider === 'apple') {
      const {authorizationCode} = await getSpringAppleCredential();
      return {
        confirmation: 'DELETE',
        appleAuthorizationCode: authorizationCode,
      };
    }

    const authorizationCode = await getSpringOAuthAuthorizationCode(provider);
    return {
      confirmation: 'DELETE',
      providerTokens: {
        [provider]: authorizationCode,
      },
    };
  } catch (error) {
    throw toDeleteAccountAuthError(normalizeAuthError(error));
  }
}

function getAuthorizationCode(payload: DeleteAccountRequest): string | null {
  return (
    payload.appleAuthorizationCode ??
    payload.providerTokens?.google ??
    payload.providerTokens?.kakao ??
    null
  );
}

export async function deleteAccount(payload: DeleteAccountRequest) {
  const authorizationCode = getAuthorizationCode(payload);
  if (!authorizationCode) throw createDeleteAccountReauthError();

  try {
    await client.request<void>('/api/v1/members/me', {
      method: 'DELETE',
      body: {authorizationCode},
      timeoutMs: DELETE_ACCOUNT_TIMEOUT_MS,
    });
  } catch (error) {
    throw toDeleteAccountApiError(error);
  }
}
