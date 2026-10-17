import React, {StrictMode} from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {AppState} from 'react-native';

import {trackGuestTransferFinished} from '../src/analytics/userEntryEvents';
import {useGuestOnboardingTransfer} from '../src/app/useGuestOnboardingTransfer';
import {resumeGuestOnboardingTransfer} from '../src/entities/onboarding/transfer';
import {getSpringMemberId} from '../src/lib/auth/spring-session';
import {renderTracked} from './support/renderers';

jest.mock('../src/entities/onboarding/transfer', () => ({
  beginGuestOnboardingTransfer: jest.fn(() => Promise.resolve()),
  cancelGuestOnboardingTransfer: jest.fn(() => Promise.resolve()),
  resumeGuestOnboardingTransfer: jest.fn(),
  toOnboardingKakaoPlaceIds: jest.fn(() => []),
}));
jest.mock('../src/lib/auth/spring-session', () => ({getSpringMemberId: jest.fn()}));
jest.mock('../src/analytics/userEntryEvents', () => ({trackGuestTransferFinished: jest.fn()}));

type Snapshot = ReturnType<typeof useGuestOnboardingTransfer>;
let latest: Snapshot;
const activeMemberIdRef: {current: string | null} = {current: 'member-1'};
const onTransferFailed = jest.fn();

function Harness({enabled}: {enabled: boolean}) {
  latest = useGuestOnboardingTransfer({
    enabled,
    activeMemberIdRef,
    posthog: null,
    onTransferFailed,
  });
  return null;
}

const act = ReactTestRenderer.act;
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};
let warnSpy: jest.SpyInstance<void, Parameters<typeof console.warn>>;

beforeEach(() => {
  activeMemberIdRef.current = 'member-1';
  jest.mocked(resumeGuestOnboardingTransfer).mockReset();
  jest.mocked(getSpringMemberId).mockReset();
  jest.mocked(AppState.addEventListener).mockClear();
  onTransferFailed.mockClear();
  // 옮기기가 실패하면 훅이 남기는 console.warn이 출력에 섞이지 않게 모든 테스트에서 beforeEach가 한 번 가로챕니다.
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

// 단언이 중간에 실패해도 가로챈 console.warn이 다음 테스트로 넘어가지 않게 되돌립니다. 그린 훅은 setupFilesAfterEnv가 먼저 내립니다.
afterEach(() => {
  warnSpy.mockRestore();
});

test('옮기기가 끝나면 회원 데이터 버전을 올리고, 다른 회원이 됐으면 올리지 않는다', async () => {
  jest.mocked(resumeGuestOnboardingTransfer).mockResolvedValue(true);
  await renderTracked(<Harness enabled />);

  await act(async () => {
    latest.resumeTransfer('member-1');
    await settle();
  });
  expect(latest.memberDataRevision).toBe(1);

  activeMemberIdRef.current = 'member-2';
  await act(async () => {
    latest.resumeTransfer('member-1');
    await settle();
  });
  expect(latest.memberDataRevision).toBe(1);
});

test('실패 안내 요청은 한 번만 보내고, 로그아웃으로 초기화하면 다시 보낸다', async () => {
  jest.mocked(resumeGuestOnboardingTransfer).mockRejectedValue(new Error('network'));
  await renderTracked(<Harness enabled />);

  await act(async () => {
    latest.resumeTransfer('member-1');
    latest.resumeTransfer('member-1');
    await settle();
  });
  expect(onTransferFailed).toHaveBeenCalledTimes(1);
  expect(trackGuestTransferFinished).toHaveBeenCalledWith(null, 'failure');

  latest.resetTransferError();
  await act(async () => {
    latest.resumeTransfer('member-1');
    await settle();
  });
  expect(onTransferFailed).toHaveBeenCalledTimes(2);
});

test('회원일 때만 포그라운드 복귀를 구독하고, 복귀하면 조용히 다시 시도한다', async () => {
  jest.mocked(getSpringMemberId).mockResolvedValue('member-1');
  jest.mocked(resumeGuestOnboardingTransfer).mockResolvedValue(true);
  const renderer = await renderTracked(<Harness enabled={false} />);
  expect(AppState.addEventListener).not.toHaveBeenCalled();

  await act(async () => renderer.update(<Harness enabled />));
  const [eventName, listener] = jest.mocked(AppState.addEventListener).mock
    .calls[0] as unknown as [string, (state: string) => void];
  expect(eventName).toBe('change');

  await act(async () => {
    listener('active');
    await settle();
  });
  expect(resumeGuestOnboardingTransfer).toHaveBeenCalledWith('member-1');
  expect(latest.memberDataRevision).toBe(1);
});

test('StrictMode처럼 effect가 다시 돌아도 응답을 버리지 않는다', async () => {
  jest.mocked(resumeGuestOnboardingTransfer).mockResolvedValue(true);
  await renderTracked(
    <StrictMode>
      <Harness enabled />
    </StrictMode>,
    {unstable_isConcurrent: true} as unknown as ReactTestRenderer.TestRendererOptions,
  );

  await act(async () => {
    latest.resumeTransfer('member-1');
    await settle();
  });
  expect(latest.memberDataRevision).toBe(1);
});
