import type { OAuthProvider } from '../../entities/user/types';
import { createApiClient, type ApiClientOptions } from '../api/client';
import { ApiError } from '../api/errors';
import { createProcessingAuthError } from './errors';
import { reauthenticateWithApple } from './signInWithApple';

/** 탈퇴 화면이 보여 주는 오류입니다. 재인증 오류와 서버 오류(ApiError)가 같은 필드를 씁니다. */
export type DeleteAccountError = {
  errorCode: string;
  message: string;
  requestId?: string | null;
};

/** 탈퇴 화면과 App이 의존하는 계약입니다. 인가 코드를 받는 경로가 바뀌어도 계약 모양은 유지합니다. */
export type AccountDeletionRepository = {
  /** 회원이 가입한 제공자로 다시 인증해 탈퇴 요청에 담을 인가 코드를 받습니다. */
  requestAuthorizationCode: (provider: OAuthProvider) => Promise<string>;
  deleteAccount: (authorizationCode: string) => Promise<void>;
};

export type AccountDeletionApiOptions = ApiClientOptions & {
  requestAuthorizationCode: AccountDeletionRepository['requestAuthorizationCode'];
  /** 앱에 남은 로그인 세션을 지웁니다. 서버 세션은 서버가 회원을 지울 때 함께 지웁니다. */
  clearSession: () => Promise<void>;
};

/** 서버 문구 대신 탈퇴 화면에 보여 줄 문구입니다. */
const DELETE_ACCOUNT_ERROR_MESSAGES: Partial<Record<string, string>> = {
  AUTH401_002: '계정 보호를 위해 다시 로그인해주세요.',
  AUTH502_001: '연결된 로그인 계정을 해제하지 못했어요.',
};

function toDeleteAccountError(error: ApiError): ApiError {
  const message = DELETE_ACCOUNT_ERROR_MESSAGES[error.errorCode];

  if (!message) {
    return error;
  }

  return new ApiError({
    status: error.status,
    errorCode: error.errorCode,
    message,
    requestId: error.requestId,
  });
}

export function createServerAccountDeletionRepository(
  options: AccountDeletionApiOptions,
): AccountDeletionRepository {
  const request = createApiClient(options);

  return {
    requestAuthorizationCode: options.requestAuthorizationCode,
    async deleteAccount(authorizationCode) {
      try {
        await request('/api/v1/members/me', {
          method: 'DELETE',
          body: { authorizationCode },
        });
      } catch (error) {
        if (!(error instanceof ApiError)) {
          throw error;
        }

        // 앞선 요청이 서버에서 끝났는데 응답을 받지 못했으면 다시 보낸 요청이 USER404_001을 받으므로
        // 탈퇴가 끝난 것으로 봅니다.
        if (error.errorCode !== 'USER404_001') {
          throw toDeleteAccountError(error);
        }
      }

      await options.clearSession();
    },
  };
}

// 서버 주소가 설정되지 않은 개발 화면에서는 재인증과 탈퇴가 바로 끝납니다.
let accountDeletionRepository: AccountDeletionRepository = {
  async requestAuthorizationCode() {
    return 'mock-authorization-code';
  },
  async deleteAccount() {},
};

/** 앱 시작 때 서버 구현을 등록합니다. */
export function configureAccountDeletionApi(
  options: AccountDeletionApiOptions,
) {
  accountDeletionRepository = createServerAccountDeletionRepository(options);
}

export function reauthenticateDeletionProvider(
  provider: OAuthProvider,
): Promise<string> {
  return accountDeletionRepository.requestAuthorizationCode(provider);
}

/** 204나 USER404_001(이미 탈퇴함)을 받으면 앱의 로그인 세션까지 지운 뒤 끝납니다. */
export function deleteAccount(authorizationCode: string): Promise<void> {
  return accountDeletionRepository.deleteAccount(authorizationCode);
}

/**
 * 서버에 보낼 인가 코드를 받는 로그인 경로가 생기기 전까지 쓰는 기존 Supabase 재인증입니다.
 * 애플은 기기 로그인 창이 준 인가 코드를 돌려줍니다. 카카오와 구글은 Supabase가 제공자 인가 코드를
 * 앱에 넘기지 않아 돌려줄 코드가 없으므로 처리 오류로 끝냅니다.
 */
export async function requestAuthorizationCodeWithSupabase(
  provider: OAuthProvider,
): Promise<string> {
  if (provider === 'APPLE') {
    const { authorizationCode } = await reauthenticateWithApple();

    if (authorizationCode) {
      return authorizationCode;
    }
  }

  throw createProcessingAuthError();
}
