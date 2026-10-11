import { AppState, type AppStateStatus } from 'react-native';

import type { HistoryReel } from '../src/entities/content/types';
import {
  reduceExtractionPoller,
  shouldPoll,
  type ExtractionPollerState,
} from '../src/lib/extraction-poller';

type ExtractionPollerModule = typeof import('../src/lib/extraction-poller');
type ApiErrorModule = typeof import('../src/lib/api/errors');

const mockGetHistoryReels = jest.fn();

jest.mock('../src/entities/content/api', () => ({
  getHistoryReels: () => mockGetHistoryReels(),
}));

function reel(
  sharedMediaId: string,
  extractionStatus: HistoryReel['extractionStatus'],
): HistoryReel {
  return {
    sharedMediaId,
    createdAt: '2026-09-21T01:00:00Z',
    thumbnailUrl: null,
    caption: null,
    author: null,
    extractionStatus,
    failureReason: extractionStatus === 'FAILED' ? 'PLACE_NOT_MATCHED' : null,
    sharedUrl: `https://www.instagram.com/reel/C${sharedMediaId}/`,
  };
}

function firstPage(...reels: HistoryReel[]) {
  return Promise.resolve({ reels, nextCursor: null });
}

const idle: ExtractionPollerState = { isActive: true, extractingIds: [] };

describe('extraction poller reducer', () => {
  it('polls only while the app is active and something is extracting', () => {
    expect(shouldPoll(idle)).toBe(false);

    const registered = reduceExtractionPoller(idle, {
      type: 'registered',
      sharedMediaIds: ['30'],
    }).state;
    expect(shouldPoll(registered)).toBe(true);

    const background = reduceExtractionPoller(registered, {
      type: 'appStateChanged',
      isActive: false,
    }).state;
    expect(shouldPoll(background)).toBe(false);
    expect(background.extractingIds).toEqual(['30']);

    const reset = reduceExtractionPoller(registered, { type: 'reset' }).state;
    expect(shouldPoll(reset)).toBe(false);
  });

  it('reports the items that left EXTRACTING and keeps the ones still extracting', () => {
    const state = { ...idle, extractingIds: ['30', '31', '32'] };

    const result = reduceExtractionPoller(state, {
      type: 'firstPageFetched',
      reels: [
        reel('32', 'EXTRACTING'),
        reel('31', 'FAILED'),
        reel('30', 'SUCCEEDED'),
        reel('29', 'SUCCEEDED'),
      ],
      requestedIds: ['30', '31', '32'],
    });

    expect(result.finished).toEqual([
      { sharedMediaId: '30', extractionStatus: 'SUCCEEDED' },
      { sharedMediaId: '31', extractionStatus: 'FAILED' },
    ]);
    expect(result.state.extractingIds).toEqual(['32']);
  });

  it('keeps an id registered during the request and drops one the first page no longer has', () => {
    const state = { ...idle, extractingIds: ['40', '41'] };

    const result = reduceExtractionPoller(state, {
      type: 'firstPageFetched',
      reels: [reel('39', 'SUCCEEDED')],
      requestedIds: ['40'],
    });

    expect(result.finished).toEqual([]);
    expect(result.state.extractingIds).toEqual(['41']);
  });

  it('follows extracting items found on the first page and ignores a duplicate registration', () => {
    const once = reduceExtractionPoller(idle, {
      type: 'registered',
      sharedMediaIds: ['50', '50'],
    }).state;
    const twice = reduceExtractionPoller(once, {
      type: 'registered',
      sharedMediaIds: ['50'],
    }).state;
    expect(once.extractingIds).toEqual(['50']);
    expect(twice).toBe(once);

    const result = reduceExtractionPoller(twice, {
      type: 'firstPageFetched',
      reels: [reel('51', 'EXTRACTING'), reel('50', 'EXTRACTING')],
      requestedIds: ['50'],
    });

    expect(result.finished).toEqual([]);
    expect(result.state.extractingIds).toEqual(['51', '50']);
  });
});

/**
 * 폴러는 상태와 AppState 구독을 모듈 변수에 두므로 테스트마다 새로 읽습니다. 폴러는 AppState를
 * 쓸 때마다 react-native에서 꺼내므로, 격리가 끝난 뒤에는 이 파일과 같은 AppState 목을 봅니다.
 */
function loadPoller() {
  let poller!: ExtractionPollerModule;
  let apiErrors!: ApiErrorModule;
  jest.isolateModules(() => {
    apiErrors = require('../src/lib/api/errors');
    poller = require('../src/lib/extraction-poller');
  });
  return { poller, apiErrors };
}

/** 이번 테스트의 폴러가 등록한 AppState 리스너를 부릅니다. */
function changeAppState(nextState: AppStateStatus) {
  const [, listener] = jest.mocked(AppState.addEventListener).mock.calls[0];
  listener(nextState);
}

describe('extraction poller', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGetHistoryReels.mockReset();
    jest.mocked(AppState.addEventListener).mockClear();
    AppState.currentState = 'active';
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('requests the first page only after something is registered and then every 3 seconds', async () => {
    const { poller } = loadPoller();
    mockGetHistoryReels.mockImplementation(() =>
      firstPage(reel('30', 'EXTRACTING')),
    );

    await jest.advanceTimersByTimeAsync(10_000);
    expect(mockGetHistoryReels).not.toHaveBeenCalled();

    poller.registerExtraction('30');
    await jest.advanceTimersByTimeAsync(2999);
    expect(mockGetHistoryReels).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(mockGetHistoryReels).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3000);
    expect(mockGetHistoryReels).toHaveBeenCalledTimes(2);
  });

  it('tells subscribers when an item finishes and stops once nothing is extracting', async () => {
    const { poller } = loadPoller();
    const listener = jest.fn();
    poller.subscribeExtractionPoller(listener);
    mockGetHistoryReels.mockImplementation(() =>
      firstPage(reel('30', 'SUCCEEDED')),
    );

    poller.registerExtraction('30');
    expect(listener).toHaveBeenLastCalledWith({
      finished: [],
      extractingCount: 1,
    });
    expect(poller.getExtractingCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(3000);
    expect(listener).toHaveBeenLastCalledWith({
      finished: [{ sharedMediaId: '30', extractionStatus: 'SUCCEEDED' }],
      extractingCount: 0,
    });
    expect(poller.getExtractingCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(mockGetHistoryReels).toHaveBeenCalledTimes(1);
  });

  it('sends a single notice for ids registered together', () => {
    const { poller } = loadPoller();
    const listener = jest.fn();
    poller.subscribeExtractionPoller(listener);

    poller.registerExtraction('30', '31');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ finished: [], extractingCount: 2 });
  });

  it('pauses in the background and resumes when the app becomes active', async () => {
    const { poller } = loadPoller();
    mockGetHistoryReels.mockImplementation(() =>
      firstPage(reel('30', 'EXTRACTING')),
    );

    poller.registerExtraction('30');
    changeAppState('background');
    await jest.advanceTimersByTimeAsync(30_000);
    expect(mockGetHistoryReels).not.toHaveBeenCalled();

    changeAppState('active');
    await jest.advanceTimersByTimeAsync(3000);
    expect(mockGetHistoryReels).toHaveBeenCalledTimes(1);
  });

  it('stops calling a listener after it unsubscribes', async () => {
    const { poller } = loadPoller();
    const listener = jest.fn();
    const unsubscribe = poller.subscribeExtractionPoller(listener);
    mockGetHistoryReels.mockImplementation(() =>
      firstPage(reel('30', 'SUCCEEDED')),
    );

    unsubscribe();
    poller.registerExtraction('30');
    await jest.advanceTimersByTimeAsync(3000);

    expect(mockGetHistoryReels).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('retries on the next tick after a network error and gives up after a 401', async () => {
    const { poller, apiErrors } = loadPoller();
    const listener = jest.fn();
    poller.subscribeExtractionPoller(listener);
    mockGetHistoryReels
      .mockImplementationOnce(() =>
        Promise.reject(apiErrors.createNetworkApiError()),
      )
      .mockImplementationOnce(() =>
        Promise.reject(
          apiErrors.toApiError(
            401,
            {
              message: '로그인이 필요한 요청입니다.',
              errorCode: 'AUTH401_004',
            },
            null,
          ),
        ),
      );

    poller.registerExtraction('30');
    await jest.advanceTimersByTimeAsync(3000);
    expect(poller.getExtractingCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(3000);
    expect(listener).toHaveBeenLastCalledWith({
      finished: [],
      extractingCount: 0,
    });

    await jest.advanceTimersByTimeAsync(30_000);
    expect(mockGetHistoryReels).toHaveBeenCalledTimes(2);
  });
});
