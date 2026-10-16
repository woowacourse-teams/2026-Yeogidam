import type {NativeShareResult} from './index';

/**
 * 네이티브가 남긴 공유 결과 가운데 앱이 지금 처리할 하나를 고릅니다.
 * 가장 최근 결과가 비회원 로그인 유도면 그 결과를, 아니면 화면이 추적 중인 요청의 결과를, 둘 다 아니면 가장 최근 결과를 고릅니다.
 */
export function selectShareResult(
  results: NativeShareResult[],
  activeRequestId: string | undefined,
): NativeShareResult | undefined {
  const latestResult = results[results.length - 1];
  if (latestResult?.transferStatus === 'GUEST_LOGIN_PROMPT') return latestResult;
  if (activeRequestId) {
    return results.find(item => item.requestId === activeRequestId) ?? latestResult;
  }
  return latestResult;
}

export type ShareResultAction =
  /** 비회원이 공유했으므로 로그인 화면으로 보냅니다. */
  | 'guest-login-prompt'
  /** 비회원 체험이나 로그인 안내가 끝났으므로 보관함을 엽니다. */
  | 'open-saved-places'
  /** 익스텐션이 로그인을 앱에 넘겼습니다. 세션이 있으면 재개하고 없으면 로그인으로 보냅니다. */
  | 'login-handoff'
  /** 익스텐션 요청이 401로 끝났습니다. */
  | 'auth-failed'
  /** 서버가 공유를 받지 못했습니다. */
  | 'extraction-failed'
  /** 익스텐션이 아직 보내는 중이라 앱이 할 일이 없습니다. */
  | 'wait'
  /** 요청이 접수됐으므로 보관함에서 진행 상태를 보여 줍니다. */
  | 'show-progress';

/** 공유 결과의 전송 상태를 앱이 할 일 하나로 바꿉니다. */
export function classifyShareResult(result: NativeShareResult): ShareResultAction {
  switch (result.transferStatus) {
    case 'GUEST_LOGIN_PROMPT':
      return 'guest-login-prompt';
    case 'GUEST_PREVIEW':
    case 'LOGIN_REQUIRED':
      return 'open-saved-places';
    case 'LOGIN_HANDOFF':
      return 'login-handoff';
    case 'API_FAILED':
    case 'API_SUCCEEDED':
      if (!result.reelId) {
        // 공유 익스텐션은 401을 AUTH401_001로 남깁니다(Android는 "AUTH401_001 | 메시지 | HTTP_401").
        return result.failureReason?.startsWith('AUTH401') ? 'auth-failed' : 'extraction-failed';
      }
      return 'show-progress';
    case 'SAVED':
    case 'WAITING_FOR_NETWORK':
    case 'WAITING_FOR_AUTH':
      return 'wait';
    default:
      return 'show-progress';
  }
}
