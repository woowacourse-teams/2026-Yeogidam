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
    // 사용자가 인증 창을 닫은 경우다. 탈퇴 화면은 이 코드를 오류로 보여주지 않는다.
    return deletionError('AUTH000_001', null, '인증이 취소됐어요.', true);
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
  // 서버는 재인증한 계정이 가입 계정과 다르거나 코드가 무효하면 AUTH401_002로 거절합니다.
  if (error.errorCode === 'AUTH401_002') {
    return deletionError(
      'USER401_001',
      401,
      '가입한 계정으로 다시 인증해주세요.',
      true,
    );
  }

  const fallback = fallbackDeleteAccountError(status);
  return {
    ...fallback,
    status: status ?? fallback.status,
    errorCode: error.errorCode ?? fallback.errorCode,
    message: error.errorCode ? error.message : fallback.message,
  };
}

/**
 * 서버·네트워크 문제로 탈퇴 결과를 알 수 없는 실패인지 판단합니다.
 * 이 경우 앱은 탈퇴된 것처럼 처리하고 운영팀이 서버에서 수동으로 탈퇴를 마무리합니다.
 * 재인증 코드 만료·다른 계정 재인증처럼 사용자가 고칠 수 있는 실패(4xx)는 해당하지 않습니다.
 */
export function isServerSideDeletionFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const {errorCode, status} = error as Partial<DeleteAccountError>;
  return (
    errorCode === 'CLIENT000_001' ||
    errorCode === 'CLIENT000_002' ||
    (typeof status === 'number' && status >= 500)
  );
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
