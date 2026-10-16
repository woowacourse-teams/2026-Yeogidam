import type {ReelApiError} from '../../entities/content/errors';
import type {
  HistoryReel,
  ReelProcessingStatus,
  SaveInstagramReelResponse,
} from '../../entities/content/types';
import {isReelInProgress} from '../../entities/content/status';
import {isLoginRequiredError} from '../../lib/api/screen-error';
import type {SharedSaveState} from '../../lib/reel-save-state';
import type {NativeShareResult} from '../../lib/share-intent';

export const REEL_POLL_INTERVAL_MS = 3000;
export const REEL_POLL_TIMEOUT_MS = 90_000;
export const REEL_POLL_FAILURE_LIMIT = 3;

/** 링크 저장이나 외부 공유로 생긴 처리 중 릴스를 지켜보는 화면 상태입니다. */
export type ReelProcessingState = {
  /** 공용 목록 폴링으로 지켜볼 릴스 ID입니다. null이면 폴링하지 않습니다. */
  processingReelId: string | null;
  /** 마지막으로 알게 된 릴스 상태입니다. 폴링은 시작 시각과 실패 여부를 여기서 읽습니다. */
  processingReel: ReelProcessingStatus | null;
  /** 링크 저장이 끝났다고 알리는 동안 true입니다. 켜질 때 보관함을 다시 읽습니다. */
  showSaveSuccess: boolean;
};

export const INITIAL_REEL_PROCESSING_STATE: ReelProcessingState = {
  processingReelId: null,
  processingReel: null,
  showSaveSuccess: false,
};

/**
 * 링크 저장 응답을 처리 중 릴스로 바꿉니다. 응답에는 썸네일이 없어 비워 둡니다.
 * 만든 시각은 부르는 쪽이 한 번 찍어 넘겨, 공유 상태와 처리 중 릴스 상태가 같은 시각을 쓰게 합니다.
 */
export function toProcessingReel(
  response: SaveInstagramReelResponse,
  createdAt: string,
): ReelProcessingStatus {
  return {
    id: response.reelId,
    processing_status: response.status,
    failure_reason: response.failureReason ?? null,
    instagram_thumbnail_url: null,
    created_at: createdAt,
  };
}

/**
 * 진행 상태를 보여 줄 네이티브 공유 결과를 외부 공유의 공유 상태로 바꿉니다.
 * 서버 reelId를 아직 받지 못했으면 share-와 지금 시각(now)으로 임시 ID를 붙이고, 만든 시각은 결과를 갱신한 시각으로 둡니다.
 */
export function toSharedSaveState(result: NativeShareResult, now: number): SharedSaveState {
  return {
    shareResultId: result.requestId,
    url: result.url,
    status: result.status,
    source: 'instagram_share',
    rawSharedText: result.rawSharedText,
    reused: result.reused,
    saveMode: result.saveMode,
    reel: {
      id: result.reelId ?? `share-${now}`,
      processing_status: result.status,
      failure_reason: result.failureReason ?? null,
      instagram_thumbnail_url: null,
      created_at: new Date(result.updatedAt).toISOString(),
    },
  };
}

/** 공유 상태 하나를 화면이 할 일로 바꾼 결과입니다. */
export type SharedSaveStateView =
  /** 완료되어 소비했거나 새 공유 URL을 아직 찾지 못했습니다. */
  | {type: 'none'}
  /** Share Extension이 서버 reelId를 기다리는 중입니다. 상태 API를 부르지 않고 응답 대기 카드만 둡니다. */
  | {type: 'awaiting-reel-id'; reel: ReelProcessingStatus}
  /** 앱 진입 때 받은 외부 공유입니다. 서버 상태를 확인하기 전에는 카드를 보여 주지 않습니다. */
  | {type: 'needs-verification'; verificationKey: string}
  /** 상태를 그대로 보여 줍니다. 처리 중이면 pollReelId를 폴링하고, 완료면 마무리합니다. */
  | {
      type: 'show';
      reel: ReelProcessingStatus;
      pollReelId: string | null;
      showSaveSuccess: boolean;
      isCompleted: boolean;
    };

/** 외부 공유를 한 번만 확인하려고 릴스 ID와 만든 시각으로 만든 키입니다. */
export function toVerificationKey(reel: Pick<ReelProcessingStatus, 'id' | 'created_at'>): string {
  return `${reel.id}:${reel.created_at}`;
}

/**
 * 두 공유 상태가 같은 저장(같은 출처, 같은 공유 요청, 같은 릴스)을 가리키는지 봅니다. 처리 상태는 보지 않습니다.
 * 확인하는 사이 링크 저장이나 다른 공유가 공유 상태를 바꿨으면 늦게 온 확인 결과를 버릴 때 씁니다.
 */
export function isSameSharedSave(current: SharedSaveState, other: SharedSaveState): boolean {
  return (
    current.source === other.source &&
    current.shareResultId === other.shareResultId &&
    current.reel.id === other.reel.id
  );
}

/**
 * 공유 상태를 화면이 할 일 하나로 바꿉니다.
 * 서버 reelId가 아직 없으면(share-로 시작) 기다리고, 확인하지 않은 외부 공유는 확인부터 하며, 나머지는 그대로 보여 줍니다.
 * share- 임시 ID는 reelId를 받기 전의 외부 공유에 toSharedSaveState가 붙이고, 링크 저장은 서버가 응답한 뒤에만 공유 상태에 적으므로 임시 ID가 없습니다.
 */
export function classifySharedSaveState(
  state: SharedSaveState | null,
  verifiedKeys: ReadonlySet<string>,
): SharedSaveStateView {
  if (!state) {
    return {type: 'none'};
  }

  const isInProgress = isReelInProgress(state.status);
  const hasRealReelId = !state.reel.id.startsWith('share-');
  if (isInProgress && !hasRealReelId) {
    return {type: 'awaiting-reel-id', reel: state.reel};
  }

  const verificationKey = toVerificationKey(state.reel);
  if (state.source === 'instagram_share' && isInProgress && !verifiedKeys.has(verificationKey)) {
    return {type: 'needs-verification', verificationKey};
  }

  return {
    type: 'show',
    reel: state.reel,
    pollReelId: isInProgress && hasRealReelId ? state.reel.id : null,
    showSaveSuccess: state.status === 'COMPLETED' && state.source === 'url_input',
    isCompleted: state.status === 'COMPLETED',
  };
}

export type ReelProcessingAction =
  /** 공유 상태가 바뀌었습니다. */
  | {type: 'sharedStateChanged'; view: SharedSaveStateView}
  /** 링크 저장을 시작했습니다. 서버가 응답하기 전에는 지켜볼 릴스가 없습니다. */
  | {type: 'linkSaveStarted'}
  /** 링크 저장 API가 응답했습니다. createdAt은 처리 중 릴스의 만든 시각으로 씁니다. */
  | {type: 'linkSaveResponded'; response: SaveInstagramReelResponse; createdAt: string}
  /** 공용 목록에서 새 상태를 찾았습니다. */
  | {type: 'pollReceived'; reel: ReelProcessingStatus}
  /** 시간 초과, 연속 실패, 멈춰야 하는 오류로 폴링을 멈춥니다. */
  | {type: 'pollStopped'}
  /** 공용 목록에서 완료를 봤습니다. */
  | {type: 'pollCompleted'; showSaveSuccess: boolean}
  /** 저장 완료를 알리는 시간이 지났습니다. */
  | {type: 'saveSuccessHidden'};

function applySharedSaveStateView(
  state: ReelProcessingState,
  view: SharedSaveStateView,
): ReelProcessingState {
  switch (view.type) {
    case 'none':
    case 'needs-verification':
      return {...state, processingReelId: null, processingReel: null};
    case 'awaiting-reel-id':
      return {...state, processingReelId: null, processingReel: view.reel};
    case 'show':
      return {
        processingReelId: view.pollReelId,
        processingReel: view.reel,
        showSaveSuccess: view.showSaveSuccess,
      };
  }
}

function nextReelProcessingState(
  state: ReelProcessingState,
  action: ReelProcessingAction,
): ReelProcessingState {
  switch (action.type) {
    case 'sharedStateChanged':
      return applySharedSaveStateView(state, action.view);
    case 'linkSaveStarted':
      return INITIAL_REEL_PROCESSING_STATE;
    case 'linkSaveResponded':
      if (action.response.status === 'COMPLETED') {
        return {processingReelId: null, processingReel: null, showSaveSuccess: true};
      }
      return {
        ...state,
        processingReelId: action.response.reelId,
        processingReel: toProcessingReel(action.response, action.createdAt),
      };
    case 'pollReceived':
      return {...state, processingReel: action.reel};
    case 'pollStopped':
      return {...state, processingReelId: null};
    case 'pollCompleted':
      return {...state, processingReelId: null, showSaveSuccess: action.showSaveSuccess};
    case 'saveSuccessHidden':
      return {...state, showSaveSuccess: false};
  }
}

/**
 * 처리 중 릴스 상태의 전환 규칙입니다. 시각과 ID처럼 바뀌는 값은 동작에 담아 받습니다.
 * 세 값이 모두 그대로면 같은 상태 객체를 돌려줘, 값마다 useState를 두던 때처럼 다시 그리지 않게 합니다.
 */
export function reelProcessingReducer(
  state: ReelProcessingState,
  action: ReelProcessingAction,
): ReelProcessingState {
  const next = nextReelProcessingState(state, action);
  return Object.is(next.processingReelId, state.processingReelId) &&
    Object.is(next.processingReel, state.processingReel) &&
    Object.is(next.showSaveSuccess, state.showSaveSuccess)
    ? state
    : next;
}

/** 지켜보는 릴스 하나의 폴링 기록입니다. 시작 시각과 놓친 횟수는 이 릴스에만 쓰고, 놓친 횟수는 폴링 훅이 그 자리에서 고칩니다. */
export type ReelPollTracking = {
  readonly reelId: string;
  /** 90초 시간 제한을 재기 시작한 시각입니다. */
  readonly startedAt: number;
  /** 목록에서 연달아 놓치거나 목록 조회에 실패한 횟수입니다. */
  failureCount: number;
};

/**
 * 폴링을 걸 때 쓸 기록을 정합니다. 같은 릴스를 이어서 지켜보면 지금 기록을 그대로 돌려주고,
 * 처음이거나 다른 릴스면 릴스를 만든 시각(지금보다 늦으면 지금)부터 놓친 횟수 0으로 새로 셉니다.
 * 만든 시각을 읽지 못하면 지금부터 셉니다.
 */
export function resolveReelPollTracking(
  current: ReelPollTracking | null,
  reelId: string,
  reelCreatedAt: string | undefined,
  now: number,
): ReelPollTracking {
  if (current?.reelId === reelId) {
    return current;
  }
  const persistedStartedAt = Date.parse(reelCreatedAt ?? '');
  return {
    reelId,
    startedAt: Number.isFinite(persistedStartedAt) ? Math.min(persistedStartedAt, now) : now,
    failureCount: 0,
  };
}

/** 폴링을 시작한 지 90초가 지났는지 봅니다. */
export function hasReelPollTimedOut(startedAt: number, now: number): boolean {
  return now - startedAt >= REEL_POLL_TIMEOUT_MS;
}

/** 공용 목록에서 지켜보던 릴스를 찾은 결과입니다. */
export type ReelListingResult =
  /** 찾았습니다. 놓친 횟수를 0으로 되돌립니다. */
  | {type: 'found'; reel: ReelProcessingStatus}
  /** 목록에 없습니다. 연달아 세 번째에 stop이 됩니다. */
  | {type: 'missing'; failureCount: number; stop: boolean};

/** 공용 목록에서 지켜보던 릴스를 찾아 처리 상태만 골라 돌려줍니다. 없으면 놓친 횟수를 하나 올립니다. */
export function findPolledReel(
  reelId: string,
  failureCount: number,
  reels: HistoryReel[],
): ReelListingResult {
  // 서버에 단건 상태 조회 API가 없어 공유 목록 첫 페이지에서 찾습니다.
  const reel = reels.find(item => item.id === reelId);
  if (reel) {
    return {
      type: 'found',
      reel: {
        id: reel.id,
        processing_status: reel.processing_status,
        failure_reason: reel.failure_reason,
        instagram_thumbnail_url: reel.instagram_thumbnail_url,
        created_at: reel.created_at,
      },
    };
  }

  const nextFailureCount = failureCount + 1;
  return {
    type: 'missing',
    failureCount: nextFailureCount,
    stop: nextFailureCount >= REEL_POLL_FAILURE_LIMIT,
  };
}

/** 공용 목록을 읽거나 반영하다 실패했을 때 다음 할 일입니다. */
export type ReelPollFailure = {
  failureCount: number;
  stop: boolean;
  requireLogin: boolean;
};

/**
 * 폴링이 실패했을 때 놓친 횟수를 올리고 멈출지 정합니다.
 * 다시 시도할 수 있는 오류는 연달아 세 번째에 멈추고, AUTH401_001과 AUTH403_001과
 * 다시 시도할 수 없는 오류는 바로 멈춥니다. AUTH401_001이면 로그인도 요청합니다.
 */
export function decideReelPollFailure(
  failureCount: number,
  error: ReelApiError,
): ReelPollFailure {
  const nextFailureCount = failureCount + 1;
  const requireLogin = isLoginRequiredError(error);
  return {
    failureCount: nextFailureCount,
    stop:
      requireLogin ||
      error.errorCode === 'AUTH403_001' ||
      !error.retryable ||
      nextFailureCount >= REEL_POLL_FAILURE_LIMIT,
    requireLogin,
  };
}
