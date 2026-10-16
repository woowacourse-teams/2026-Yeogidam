import React, {StrictMode} from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Alert, AppState} from 'react-native';

import {trackGuestTransferFinished} from '../src/analytics/userEntryEvents';
import {useGuestOnboardingTransfer} from '../src/app/useGuestOnboardingTransfer';
import {resumeGuestOnboardingTransfer} from '../src/entities/onboarding/transfer';
import {getSpringMemberId} from '../src/lib/auth/spring-session';

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

function Harness({enabled}: {enabled: boolean}) {
  latest = useGuestOnboardingTransfer({enabled, activeMemberIdRef, posthog: null});
  return null;
}

const act = ReactTestRenderer.act;
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => {
  activeMemberIdRef.current = 'member-1';
  jest.mocked(resumeGuestOnboardingTransfer).mockReset();
  jest.mocked(getSpringMemberId).mockReset();
  jest.mocked(AppState.addEventListener).mockClear();
});

test('옮기기가 끝나면 회원 데이터 버전을 올리고, 다른 회원이 됐으면 올리지 않는다', async () => {
  jest.mocked(resumeGuestOnboardingTransfer).mockResolvedValue(true);
  await act(async () => {
    ReactTestRenderer.create(<Harness enabled />);
  });

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

test('실패 안내는 한 번만 띄우고, 로그아웃으로 초기화하면 다시 띄운다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.mocked(resumeGuestOnboardingTransfer).mockRejectedValue(new Error('network'));
  await act(async () => {
    ReactTestRenderer.create(<Harness enabled />);
  });

  await act(async () => {
    latest.resumeTransfer('member-1');
    latest.resumeTransfer('member-1');
    await settle();
  });
  expect(alert).toHaveBeenCalledTimes(1);
  expect(trackGuestTransferFinished).toHaveBeenCalledWith(null, 'failure');

  latest.resetTransferError();
  await act(async () => {
    latest.resumeTransfer('member-1');
    await settle();
  });
  expect(alert).toHaveBeenCalledTimes(2);

  alert.mockRestore();
  warn.mockRestore();
});

test('회원일 때만 포그라운드 복귀를 구독하고, 복귀하면 조용히 다시 시도한다', async () => {
  jest.mocked(getSpringMemberId).mockResolvedValue('member-1');
  jest.mocked(resumeGuestOnboardingTransfer).mockResolvedValue(true);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<Harness enabled={false} />);
  });
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
  await act(async () => {
    ReactTestRenderer.create(
      <StrictMode>
        <Harness enabled />
      </StrictMode>,
      {unstable_isConcurrent: true} as unknown as ReactTestRenderer.TestRendererOptions,
    );
  });

  await act(async () => {
    latest.resumeTransfer('member-1');
    await settle();
  });
  expect(latest.memberDataRevision).toBe(1);
});
