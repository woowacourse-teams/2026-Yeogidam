import {decideOtaAction, OTA_CHECK_INTERVAL_MS} from '../src/lib/ota-updates';

const NOW = 1_000_000;

test('expo-updates가 꺼져 있으면 아무것도 하지 않는다', () => {
  expect(
    decideOtaAction({isEnabled: false, hasFetchedUpdate: true, lastCheckedAt: null, now: NOW}),
  ).toBe('skip');
});

test('받아 둔 업데이트가 있으면 복귀한 순간 다시 시작한다', () => {
  expect(
    decideOtaAction({isEnabled: true, hasFetchedUpdate: true, lastCheckedAt: NOW, now: NOW}),
  ).toBe('reload');
});

test('처음이거나 간격이 지났으면 서버에 묻고, 아니면 건너뛴다', () => {
  expect(
    decideOtaAction({isEnabled: true, hasFetchedUpdate: false, lastCheckedAt: null, now: NOW}),
  ).toBe('check');
  expect(
    decideOtaAction({
      isEnabled: true,
      hasFetchedUpdate: false,
      lastCheckedAt: NOW - OTA_CHECK_INTERVAL_MS,
      now: NOW,
    }),
  ).toBe('check');
  expect(
    decideOtaAction({
      isEnabled: true,
      hasFetchedUpdate: false,
      lastCheckedAt: NOW - OTA_CHECK_INTERVAL_MS + 1,
      now: NOW,
    }),
  ).toBe('skip');
});
