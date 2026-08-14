import type {Session, User} from '@supabase/supabase-js';

import {normalizeAuthError, type NormalizedAuthError} from './errors';
import {reauthenticateWithApple} from './signInWithApple';
import {signInWithGoogle} from './signInWithGoogle';
import {signInWithKakao} from './signInWithKakao';
import {SUPABASE_URL, supabase} from './supabase';

const DELETE_ACCOUNT_TIMEOUT_MS = 10_000;

export type AccountDeletionProvider = 'apple' | 'google' | 'kakao';

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

type SessionSnapshot = Pick<Session, 'access_token' | 'refresh_token' | 'user'>;

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

  if (status === 405) {
    return deletionError(
      'COMMON405_001',
      405,
      '지원하지 않는 요청 방식이에요.',
      false,
    );
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
    return deletionError(
      'USER401_001',
      401,
      '계정 보호를 위해 다시 로그인해주세요.',
      true,
    );
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

function getLinkedProviderSet(user: User | null) {
  const providers = new Set<AccountDeletionProvider>();

  user?.app_metadata.providers?.forEach(provider => {
    if (provider === 'apple' || provider === 'google' || provider === 'kakao') {
      providers.add(provider);
    }
  });

  user?.identities?.forEach(identity => {
    if (
      identity.provider === 'apple' ||
      identity.provider === 'google' ||
      identity.provider === 'kakao'
    ) {
      providers.add(identity.provider);
    }
  });

  return providers;
}

export function getLinkedDeletionProviders(user: User | null) {
  const linkedProviders = getLinkedProviderSet(user);

  return (['google', 'kakao', 'apple'] as AccountDeletionProvider[]).filter(
    provider => linkedProviders.has(provider),
  );
}

async function getCurrentSessionSnapshot(): Promise<SessionSnapshot> {
  const {
    data: {session},
  } = await supabase.auth.getSession();

  if (!session) {
    throw deletionError('AUTH401_001', 401, '로그인이 필요해요.', true);
  }

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user: session.user,
  };
}

async function restoreSession(snapshot: SessionSnapshot) {
  await supabase.auth
    .setSession({
      access_token: snapshot.access_token,
      refresh_token: snapshot.refresh_token,
    })
    .catch(() => undefined);
}

async function ensureSameUserSession(
  snapshot: SessionSnapshot,
  session: Session,
) {
  if (session.user.id === snapshot.user.id) {
    return;
  }

  await restoreSession(snapshot);
  throw createDeleteAccountReauthError();
}

export async function reauthenticateDeletionProvider(
  provider: AccountDeletionProvider,
): Promise<DeleteAccountRequest> {
  const snapshot = await getCurrentSessionSnapshot();

  try {
    if (provider === 'apple') {
      const {authorizationCode, session} = await reauthenticateWithApple();

      await ensureSameUserSession(snapshot, session);

      if (!authorizationCode) {
        throw deletionError(
          'CLIENT000_003',
          null,
          '응답을 처리하지 못했어요.',
          false,
        );
      }

      return {
        confirmation: 'DELETE',
        appleAuthorizationCode: authorizationCode,
      };
    }

    const session =
      provider === 'google'
        ? await signInWithGoogle()
        : await signInWithKakao();

    await ensureSameUserSession(snapshot, session);

    if (!session.provider_token) {
      throw deletionError(
        'CLIENT000_003',
        null,
        '응답을 처리하지 못했어요.',
        false,
      );
    }

    return {
      confirmation: 'DELETE',
      providerTokens: {
        [provider]: session.provider_token,
      },
    };
  } catch (error) {
    if ((error as DeleteAccountError).errorCode) {
      throw error;
    }

    throw toDeleteAccountAuthError(normalizeAuthError(error));
  }
}

export async function deleteAccount(payload: DeleteAccountRequest) {
  const {
    data: {session},
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw deletionError('AUTH401_001', 401, '로그인이 필요해요.', true);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DELETE_ACCOUNT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted
      ? deletionError(
          'CLIENT000_002',
          null,
          '응답이 늦어지고 있어요. 잠시 후 다시 시도해주세요.',
          true,
        )
      : deletionError(
          'CLIENT000_001',
          null,
          '인터넷 연결을 확인해주세요.',
          true,
        );
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 204) {
    return;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw fallbackDeleteAccountError(null);
  }

  if (!response.ok) {
    const normalized = body as Partial<DeleteAccountError>;
    const fallback = fallbackDeleteAccountError(response.status);

    throw {
      ...fallback,
      ...normalized,
      status: normalized.status ?? fallback.status,
    };
  }

  throw fallbackDeleteAccountError(null);
}
