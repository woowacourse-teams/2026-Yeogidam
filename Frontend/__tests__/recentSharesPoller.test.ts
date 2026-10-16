import {AppState} from 'react-native';

import {getHistoryReels} from '../src/entities/content/history-api';
import {
  subscribeRecentShares,
  type RecentSharesSubscription,
} from '../src/entities/content/recent-shares-poller';

jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReels: jest.fn(),
}));

const snapshot = {reels: [], nextCursor: null};
const subscriptions: RecentSharesSubscription[] = [];

function subscribe(intervalMs: number) {
  const onResult = jest.fn();
  const onError = jest.fn();
  const subscription = subscribeRecentShares({intervalMs, onResult, onError});
  subscriptions.push(subscription);
  return {subscription, onResult, onError};
}

async function tick(ms: number) {
  jest.advanceTimersByTime(ms);
  // 요청 응답과 다음 예약까지 이어지도록 마이크로태스크를 비운다.
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function setAppState(state: string) {
  Object.defineProperty(AppState, 'currentState', {value: state, configurable: true});
}

beforeEach(() => {
  jest.useFakeTimers();
  setAppState('active');
  jest.mocked(getHistoryReels).mockReset().mockResolvedValue(snapshot);
});

afterEach(() => {
  subscriptions.splice(0).forEach(subscription => subscription.unsubscribe());
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('구독자가 여럿이어도 가장 짧은 주기로 한 번만 읽고 결과를 모두에게 나눈다', async () => {
  const history = subscribe(3000);
  const badge = subscribe(5000);

  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(1);
  expect(getHistoryReels).toHaveBeenCalledWith();
  expect(history.onResult).toHaveBeenCalledWith(snapshot);
  expect(badge.onResult).toHaveBeenCalledWith(snapshot);

  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
});

test('짧은 주기의 구독자가 떠나면 남은 구독자의 주기로 돌아간다', async () => {
  const history = subscribe(3000);
  subscribe(5000);

  history.subscription.unsubscribe();
  await tick(3000);
  expect(getHistoryReels).not.toHaveBeenCalled();
  await tick(2000);
  expect(getHistoryReels).toHaveBeenCalledTimes(1);
});

test('구독자가 모두 떠나면 더 읽지 않는다', async () => {
  const {subscription} = subscribe(3000);
  subscription.unsubscribe();

  await tick(10_000);
  expect(getHistoryReels).not.toHaveBeenCalled();
});

test('읽는 중에 refresh를 부르면 같은 요청을 함께 쓴다', async () => {
  let resolve!: (value: typeof snapshot) => void;
  jest.mocked(getHistoryReels).mockImplementationOnce(
    () => new Promise(next => { resolve = next; }),
  );
  const {subscription, onResult} = subscribe(3000);

  const first = subscription.refresh();
  const second = subscription.refresh();
  resolve(snapshot);

  await expect(Promise.all([first, second])).resolves.toEqual([snapshot, snapshot]);
  expect(getHistoryReels).toHaveBeenCalledTimes(1);
  expect(onResult).toHaveBeenCalledTimes(1);
});

test('실패는 모든 구독자의 onError로 알리고 다음 차례에 다시 읽는다', async () => {
  const error = new Error('offline');
  jest.mocked(getHistoryReels).mockRejectedValueOnce(error);
  const history = subscribe(3000);
  const badge = subscribe(5000);

  await tick(3000);
  expect(history.onError).toHaveBeenCalledWith(error);
  expect(badge.onError).toHaveBeenCalledWith(error);

  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(history.onResult).toHaveBeenCalledWith(snapshot);
});

test('백그라운드에서는 읽지 않는다', async () => {
  subscribe(3000);
  setAppState('background');

  await tick(9000);
  expect(getHistoryReels).not.toHaveBeenCalled();

  setAppState('active');
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(1);
});
