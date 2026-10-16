import type {ReelApiError} from '../../entities/content/errors';
import type {
  HistoryReel,
  ReelProcessingStatus,
  SaveInstagramReelResponse,
} from '../../entities/content/types';
import type {SharedSaveState} from '../../lib/reel-save-state';

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
 * 공유 상태를 화면이 할 일 하나로 바꿉니다.
 * 서버 reelId가 아직 없으면(share-로 시작) 기다리고, 확인하지 않은 외부 공유는 확인부터 하며, 나머지는 그대로 보여 줍니다.
 */
export function classifySharedSaveState(
  state: SharedSaveState | null,
  verifiedKeys: ReadonlySet<string>,
): SharedSaveStateView {
  if (!state) {
    return {type: 'none'};
  }

  const isInProgress = state.status === 'PENDING' || state.status === 'PROCESSING';
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
  /** 링크 저장을 시작했습니다. */
  | {type: 'linkSaveStarted'; reel: ReelProcessingStatus}
  /** 링크 저장 API가 응답했습니다. createdAt은 처리 중 릴스의 만든 시각으로 씁니다. */
  | {type: 'linkSaveResponded'; response: SaveInstagramReelResponse; createdAt: string}
  /** 링크 저장 API가 실패했습니다. */
  | {type: 'linkSaveFailed'; reel: ReelProcessingStatus}
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
      return {processingReelId: null, processingReel: action.reel, showSaveSuccess: false};
    case 'linkSaveResponded':
      if (action.response.status === 'COMPLETED') {
        return {processingReelId: null, processingReel: null, showSaveSuccess: true};
      }
      return {
        ...state,
        processingReelId: action.response.reelId,
        processingReel: {
          id: action.response.reelId,
          processing_status: action.response.status,
          failure_reason: action.response.failureReason ?? null,
          instagram_thumbnail_url: null,
          created_at: action.createdAt,
        },
      };
    case 'linkSaveFailed':
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

/**
 * 폴링 시작 시각을 정합니다. 이미 재고 있으면 그대로 두고, 처음이면 릴스를 만든 시각(지금보다 늦으면 지금)부터 셉니다.
 * 만든 시각을 읽지 못하면 지금부터 셉니다.
 */
export function resolvePollStartedAt(
  current: number | null,
  reelCreatedAt: string | undefined,
  now: number,
): number {
  // TODO(review): 폴링 중에 새 링크를 저장해 릴스 ID가 바로 바뀌면 시작 시각을 이어받아 새 릴스가 90초를 다 쓰지 못합니다.
  if (current !== null) {
    return current;
  }
  const persistedStartedAt = Date.parse(reelCreatedAt ?? '');
  return Number.isFinite(persistedStartedAt) ? Math.min(persistedStartedAt, now) : now;
}

/** 폴링을 시작한 지 90초가 지났는지 봅니다. 시작 시각이 없으면 지나지 않은 것으로 봅니다. */
export function hasReelPollTimedOut(startedAt: number | null, now: number): boolean {
  return now - (startedAt ?? now) >= REEL_POLL_TIMEOUT_MS;
}

/** 공용 목록을 한 번 읽은 결과입니다. */
export type ReelPollOutcome =
  | {type: 'listed'; reels: HistoryReel[]}
  | {type: 'failed'; error: ReelApiError};

/** 폴링 한 번의 결과를 화면이 할 일로 바꾼 것입니다. */
export type ReelPollDecision =
  /** 목록에서 릴스를 찾았습니다. 실패 횟수를 0으로 되돌립니다. */
  | {type: 'found'; reel: ReelProcessingStatus}
  /** 목록에 없거나 읽지 못했습니다. stop이면 폴링을 멈추고, requireLogin이면 로그인을 요청합니다. */
  | {type: 'missed'; failureCount: number; stop: boolean; requireLogin: boolean};

/**
 * 공용 목록을 읽은 결과로 다음 할 일을 정합니다.
 * 목록에 없거나 다시 시도할 수 있는 오류는 연달아 세 번째에 멈추고, AUTH401_001과 AUTH403_001과
 * 다시 시도할 수 없는 오류는 바로 멈춥니다. AUTH401_001이면 로그인도 요청합니다.
 */
export function decideReelPoll(
  reelId: string,
  failureCount: number,
  outcome: ReelPollOutcome,
): ReelPollDecision {
  const nextFailureCount = failureCount + 1;

  if (outcome.type === 'listed') {
    // 서버에 단건 상태 조회 API가 없어 공유 목록 첫 페이지에서 찾습니다.
    const reel = outcome.reels.find(item => item.id === reelId);
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
    return {
      type: 'missed',
      failureCount: nextFailureCount,
      stop: nextFailureCount >= REEL_POLL_FAILURE_LIMIT,
      requireLogin: false,
    };
  }

  const {errorCode, retryable} = outcome.error;
  return {
    type: 'missed',
    failureCount: nextFailureCount,
    stop:
      errorCode === 'AUTH401_001' ||
      errorCode === 'AUTH403_001' ||
      !retryable ||
      nextFailureCount >= REEL_POLL_FAILURE_LIMIT,
    requireLogin: errorCode === 'AUTH401_001',
  };
}
