import {ReelApiError} from '../src/entities/content/errors';
import type {HistoryReel, ReelProcessingStatus} from '../src/entities/content/types';
import type {SharedSaveState} from '../src/lib/reel-save-state';
import {
  classifySharedSaveState,
  decideReelPollFailure,
  findPolledReel,
  hasReelPollTimedOut,
  INITIAL_REEL_PROCESSING_STATE,
  isSameSharedSave,
  reelProcessingReducer,
  resolveReelPollTracking,
  toVerificationKey,
  type ReelProcessingAction,
  type ReelProcessingState,
} from '../src/pages/saved-places/reelProcessing';

const CREATED_AT = '2026-10-16T09:00:00Z';
const NOW = Date.parse(CREATED_AT);

const reel = (
  id: string,
  status: ReelProcessingStatus['processing_status'] = 'PROCESSING',
): ReelProcessingStatus => ({
  id,
  processing_status: status,
  failure_reason: null,
  instagram_thumbnail_url: null,
  created_at: CREATED_AT,
});

const shared = (overrides: Partial<SharedSaveState> & {reel: ReelProcessingStatus}): SharedSaveState => ({
  url: 'https://www.instagram.com/reel/abc/',
  status: overrides.reel.processing_status,
  source: 'instagram_share',
  ...overrides,
});

const historyReel = (id: string, status: HistoryReel['processing_status']): HistoryReel => ({
  id,
  instagram_url: null,
  instagram_title: null,
  instagram_description: null,
  instagram_author_username: null,
  instagram_thumbnail_url: 'https://cdn.example.com/8.jpg',
  processing_status: status,
  failure_reason: null,
  save_mode: null,
  created_at: CREATED_AT,
});

function run(initial: ReelProcessingState, ...actions: ReelProcessingAction[]): ReelProcessingState {
  return actions.reduce(reelProcessingReducer, initial);
}

const NO_KEYS = new Set<string>();

describe('classifySharedSaveState', () => {
  test('공유 상태가 없으면 none이다', () => {
    expect(classifySharedSaveState(null, NO_KEYS)).toEqual({type: 'none'});
  });

  test('서버 reelId가 오기 전(share-)의 처리 중 공유는 기다린다', () => {
    const waiting = reel('share-1', 'PENDING');
    expect(classifySharedSaveState(shared({reel: waiting}), NO_KEYS)).toEqual({
      type: 'awaiting-reel-id',
      reel: waiting,
    });
  });

  test('확인하지 않은 처리 중 외부 공유는 확인부터 하고, 확인한 뒤에는 폴링할 ID와 함께 보여 준다', () => {
    const state = shared({reel: reel('8')});
    const key = toVerificationKey(state.reel);
    expect(key).toBe(`8:${CREATED_AT}`);
    expect(classifySharedSaveState(state, NO_KEYS)).toEqual({type: 'needs-verification', verificationKey: key});
    expect(classifySharedSaveState(state, new Set([key]))).toEqual({
      type: 'show',
      reel: state.reel,
      pollReelId: '8',
      showSaveSuccess: false,
      isCompleted: false,
    });
  });

  test('링크 저장은 확인 없이 보여 주고, 완료면 저장 완료를 알린다', () => {
    const processing = shared({source: 'url_input', reel: reel('manual-1')});
    expect(classifySharedSaveState(processing, NO_KEYS)).toMatchObject({type: 'show', pollReelId: 'manual-1'});

    const completed = shared({source: 'url_input', reel: reel('8', 'COMPLETED')});
    expect(classifySharedSaveState(completed, NO_KEYS)).toEqual({
      type: 'show',
      reel: completed.reel,
      pollReelId: null,
      showSaveSuccess: true,
      isCompleted: true,
    });
  });

  test('완료된 외부 공유와 실패한 공유는 폴링하지 않고 저장 완료도 알리지 않는다', () => {
    expect(classifySharedSaveState(shared({reel: reel('8', 'COMPLETED')}), NO_KEYS)).toMatchObject({
      type: 'show',
      pollReelId: null,
      showSaveSuccess: false,
      isCompleted: true,
    });
    expect(
      classifySharedSaveState(shared({source: 'url_input', reel: reel('8', 'FAILED')}), NO_KEYS),
    ).toMatchObject({type: 'show', pollReelId: null, showSaveSuccess: false, isCompleted: false});
  });
});

describe('isSameSharedSave', () => {
  const verifying = shared({shareResultId: 'request-1', reel: reel('8', 'PENDING')});

  test('출처와 공유 요청과 릴스가 같으면 처리 상태가 달라도 같은 저장이다', () => {
    expect(isSameSharedSave(shared({shareResultId: 'request-1', reel: reel('8')}), verifying)).toBe(true);
  });

  test('출처나 공유 요청이나 릴스가 다르면 다른 저장이다', () => {
    expect(isSameSharedSave(shared({source: 'url_input', shareResultId: 'request-1', reel: reel('8')}), verifying)).toBe(false);
    expect(isSameSharedSave(shared({shareResultId: 'request-2', reel: reel('8')}), verifying)).toBe(false);
    expect(isSameSharedSave(shared({shareResultId: 'request-1', reel: reel('9')}), verifying)).toBe(false);
  });
});

describe('reelProcessingReducer', () => {
  const trackedReel = reel('8');
  const tracking: ReelProcessingState = {
    processingReelId: '8',
    processingReel: trackedReel,
    showSaveSuccess: true,
  };

  test('공유 상태가 없거나 확인이 필요하면 처리 중 표시를 지우고 저장 완료 표시는 둔다', () => {
    for (const view of [{type: 'none'}, {type: 'needs-verification', verificationKey: 'k'}] as const) {
      expect(run(tracking, {type: 'sharedStateChanged', view})).toEqual({
        processingReelId: null,
        processingReel: null,
        showSaveSuccess: true,
      });
    }
  });

  test('reelId를 기다리는 공유는 카드만 두고 폴링하지 않는다', () => {
    const waiting = reel('share-1', 'PENDING');
    expect(
      run(tracking, {type: 'sharedStateChanged', view: {type: 'awaiting-reel-id', reel: waiting}}),
    ).toEqual({processingReelId: null, processingReel: waiting, showSaveSuccess: true});
  });

  test('보여 줄 공유는 세 값을 모두 바꾼다', () => {
    const completed = reel('9', 'COMPLETED');
    expect(
      run(tracking, {
        type: 'sharedStateChanged',
        view: {type: 'show', reel: completed, pollReelId: null, showSaveSuccess: false, isCompleted: true},
      }),
    ).toEqual({processingReelId: null, processingReel: completed, showSaveSuccess: false});
  });

  test('링크 저장을 시작하면 이전 릴스를 잊고 새 릴스를 둔다', () => {
    const started = reel('manual-1');
    expect(run(tracking, {type: 'linkSaveStarted', reel: started})).toEqual({
      processingReelId: null,
      processingReel: started,
      showSaveSuccess: false,
    });
  });

  test('링크 저장이 바로 완료되면 처리 중 표시를 지우고 저장 완료를 알린다', () => {
    expect(
      run(tracking, {
        type: 'linkSaveResponded',
        response: {reelId: '8', status: 'COMPLETED', reused: true},
        createdAt: CREATED_AT,
      }),
    ).toEqual({processingReelId: null, processingReel: null, showSaveSuccess: true});
  });

  test('링크 저장이 처리 중이거나 실패로 응답하면 응답한 릴스를 지켜볼 대상으로 둔다', () => {
    const idle = {...INITIAL_REEL_PROCESSING_STATE};
    expect(
      run(idle, {
        type: 'linkSaveResponded',
        response: {reelId: '8', status: 'FAILED', failureReason: 'MEDIA400_001', reused: false},
        createdAt: CREATED_AT,
      }),
    ).toEqual({
      processingReelId: '8',
      processingReel: {...reel('8', 'FAILED'), failure_reason: 'MEDIA400_001'},
      showSaveSuccess: false,
    });
  });

  test('저장 실패와 폴링 결과는 릴스만 바꾸고, 멈춤과 완료와 알림 끄기는 각자 한 값만 바꾼다', () => {
    const failed = reel('manual-failed-1', 'FAILED');
    expect(run(tracking, {type: 'linkSaveFailed', reel: failed}).processingReel).toBe(failed);
    expect(run(tracking, {type: 'pollReceived', reel: failed})).toEqual({...tracking, processingReel: failed});
    expect(run(tracking, {type: 'pollStopped'})).toEqual({...tracking, processingReelId: null});
    expect(run(tracking, {type: 'pollCompleted', showSaveSuccess: false})).toEqual({
      ...tracking,
      processingReelId: null,
      showSaveSuccess: false,
    });
    expect(run(tracking, {type: 'saveSuccessHidden'})).toEqual({...tracking, showSaveSuccess: false});
  });

  test('세 값이 모두 그대로면 같은 상태 객체를 돌려준다', () => {
    const cleared = {...INITIAL_REEL_PROCESSING_STATE};
    expect(reelProcessingReducer(cleared, {type: 'sharedStateChanged', view: {type: 'none'}})).toBe(cleared);
    expect(reelProcessingReducer(cleared, {type: 'pollStopped'})).toBe(cleared);
    expect(reelProcessingReducer(cleared, {type: 'saveSuccessHidden'})).toBe(cleared);
    expect(reelProcessingReducer(tracking, {type: 'pollReceived', reel: trackedReel})).toBe(tracking);
    expect(reelProcessingReducer(tracking, {type: 'pollReceived', reel: reel('8')})).not.toBe(tracking);
  });

  test('링크 저장 흐름은 화면이 한 번에 반영하던 순서대로 처리 중 릴스를 폴링 대상으로 남긴다', () => {
    // 시작하면 공유 상태 구독이 곧바로 manual- 릴스를 폴링 대상으로 둔다.
    const initialReel = reel('manual-1');
    const started = run(
      INITIAL_REEL_PROCESSING_STATE,
      {type: 'linkSaveStarted', reel: initialReel},
      {
        type: 'sharedStateChanged',
        view: classifySharedSaveState(shared({source: 'url_input', reel: initialReel}), NO_KEYS),
      },
    );
    expect(started.processingReelId).toBe('manual-1');

    const responded = run(
      started,
      {
        type: 'sharedStateChanged',
        view: classifySharedSaveState(shared({source: 'url_input', reel: reel('8')}), NO_KEYS),
      },
      {
        type: 'linkSaveResponded',
        response: {reelId: '8', status: 'PROCESSING', reused: false},
        createdAt: '2026-10-16T09:00:01.000Z',
      },
    );
    expect(responded).toEqual({
      processingReelId: '8',
      processingReel: {...reel('8'), created_at: '2026-10-16T09:00:01.000Z'},
      showSaveSuccess: false,
    });
  });
});

describe('폴링 시작 시각과 시간 제한', () => {
  test('처음이면 릴스를 만든 시각부터 놓친 횟수 0으로 세고, 만든 시각이 미래거나 읽을 수 없으면 지금부터 센다', () => {
    expect(resolveReelPollTracking(null, '8', '2026-10-16T08:59:00Z', NOW)).toEqual({
      reelId: '8',
      startedAt: NOW - 60_000,
      failureCount: 0,
    });
    expect(resolveReelPollTracking(null, '8', '2026-10-16T09:01:00Z', NOW).startedAt).toBe(NOW);
    expect(resolveReelPollTracking(null, '8', 'not a date', NOW).startedAt).toBe(NOW);
    expect(resolveReelPollTracking(null, '8', undefined, NOW).startedAt).toBe(NOW);
  });

  test('같은 릴스를 이어서 지켜보면 시작 시각과 놓친 횟수를 그대로 둔다', () => {
    const tracking = {reelId: '8', startedAt: NOW - 60_000, failureCount: 2};
    expect(resolveReelPollTracking(tracking, '8', '2026-10-16T09:00:00Z', NOW)).toBe(tracking);
  });

  test('다른 릴스로 바뀌면 시작 시각과 놓친 횟수를 처음부터 센다', () => {
    const tracking = {reelId: 'manual-1', startedAt: NOW - 60_000, failureCount: 2};
    expect(resolveReelPollTracking(tracking, '8', '2026-10-16T09:00:00Z', NOW)).toEqual({
      reelId: '8',
      startedAt: NOW,
      failureCount: 0,
    });
  });

  test('90초가 되는 순간부터 시간 초과다', () => {
    expect(hasReelPollTimedOut(NOW, NOW + 89_999)).toBe(false);
    expect(hasReelPollTimedOut(NOW, NOW + 90_000)).toBe(true);
    expect(hasReelPollTimedOut(null, NOW)).toBe(false);
  });
});

describe('findPolledReel', () => {
  test('목록에서 찾으면 처리 상태만 골라 돌려준다', () => {
    expect(findPolledReel('8', 2, [historyReel('7', 'PROCESSING'), historyReel('8', 'COMPLETED')])).toEqual({
      type: 'found',
      reel: {...reel('8', 'COMPLETED'), instagram_thumbnail_url: 'https://cdn.example.com/8.jpg'},
    });
  });

  test('목록에 없으면 놓친 횟수를 올리고 세 번째에 멈춘다', () => {
    expect(findPolledReel('8', 0, [])).toEqual({type: 'missing', failureCount: 1, stop: false});
    expect(findPolledReel('8', 2, [historyReel('7', 'PROCESSING')])).toEqual({
      type: 'missing',
      failureCount: 3,
      stop: true,
    });
  });
});

describe('decideReelPollFailure', () => {
  const error = (params: ConstructorParameters<typeof ReelApiError>[0]) => new ReelApiError(params);

  test('다시 시도할 수 있는 오류는 세 번째에 멈춘다', () => {
    const network = error({errorCode: 'CLIENT000_001', message: '인터넷 연결', retryable: true});
    expect(decideReelPollFailure(1, network)).toEqual({failureCount: 2, stop: false, requireLogin: false});
    expect(decideReelPollFailure(2, network)).toEqual({failureCount: 3, stop: true, requireLogin: false});
  });

  test('AUTH401_001은 바로 멈추고 로그인을 요청하며, AUTH403_001과 다시 시도할 수 없는 오류는 바로 멈춘다', () => {
    expect(
      decideReelPollFailure(0, error({errorCode: 'AUTH401_001', message: '로그인', retryable: true})),
    ).toEqual({failureCount: 1, stop: true, requireLogin: true});
    expect(
      decideReelPollFailure(0, error({errorCode: 'AUTH403_001', message: '권한', retryable: true})),
    ).toEqual({failureCount: 1, stop: true, requireLogin: false});
    expect(
      decideReelPollFailure(0, error({errorCode: 'COMMON400_001', message: '요청', retryable: false})),
    ).toEqual({failureCount: 1, stop: true, requireLogin: false});
  });
});
