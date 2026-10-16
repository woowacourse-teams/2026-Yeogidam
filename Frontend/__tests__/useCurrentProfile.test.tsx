import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {useCurrentProfile} from '../src/app/useCurrentProfile';
import {deferred} from './support/deferred';
import {getCurrentProfile} from '../src/entities/info/api';
import type {ProfileApiError, ProfileInfo} from '../src/entities/info/types';

jest.mock('../src/entities/info/api', () => ({getCurrentProfile: jest.fn()}));

const PROFILE_A: ProfileInfo = {id: 'member-a', nickname: '담이 1'};
const PROFILE_B: ProfileInfo = {id: 'member-b', nickname: '담이 2'};
const ERROR: ProfileApiError = {
  status: 500,
  errorCode: 'SERVER500_001',
  message: '서버 오류',
  retryable: true,
};

type Snapshot = ReturnType<typeof useCurrentProfile>;
let latest: Snapshot;

function Harness({enabled}: {enabled: boolean}) {
  latest = useCurrentProfile(enabled);
  return null;
}

const mounted: ReactTestRenderer.ReactTestRenderer[] = [];

async function render(enabled: boolean) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness enabled={enabled} />);
  });
  mounted.push(renderer);
  return {
    renderer,
    rerender: (next: boolean) =>
      ReactTestRenderer.act(async () => {
        renderer.update(<Harness enabled={next} />);
      }),
  };
}

const flush = () => ReactTestRenderer.act(async () => undefined);

beforeEach(() => {
  jest.mocked(getCurrentProfile).mockReset();
});

// 테스트가 그린 훅을 모두 내려, 늦게 끝나는 요청이 다음 테스트의 상태를 건드리지 않게 합니다.
afterEach(async () => {
  for (const renderer of mounted.splice(0)) {
    await ReactTestRenderer.act(async () => renderer.unmount());
  }
});

test('켜지면 프로필을 읽고, 꺼지면 세 값을 모두 비운다', async () => {
  const request = deferred<ProfileInfo>();
  jest.mocked(getCurrentProfile).mockReturnValue(request.promise);

  const {rerender} = await render(true);
  expect(latest.isProfileLoading).toBe(true);

  request.resolve(PROFILE_A);
  await flush();
  expect(latest.currentProfile).toEqual(PROFILE_A);
  expect(latest.isProfileLoading).toBe(false);

  await rerender(false);
  expect(latest.currentProfile).toBeNull();
  expect(latest.profileError).toBeNull();
  expect(latest.isProfileLoading).toBe(false);
});

test('실패하면 오류를 두고, 재시도에 성공하면 프로필을 채운다', async () => {
  jest.mocked(getCurrentProfile).mockRejectedValueOnce(ERROR).mockResolvedValueOnce(PROFILE_A);

  await render(true);
  await flush();
  expect(latest.currentProfile).toBeNull();
  expect(latest.profileError).toEqual(ERROR);

  await ReactTestRenderer.act(async () => {
    await latest.retryProfile();
  });
  expect(latest.currentProfile).toEqual(PROFILE_A);
  expect(latest.isProfileLoading).toBe(false);
});

test('재시도 응답이 꺼진 뒤에 늦게 와도 이전 회원의 프로필을 쓰지 않는다', async () => {
  const retry = deferred<ProfileInfo>();
  jest.mocked(getCurrentProfile).mockResolvedValueOnce(PROFILE_A).mockReturnValueOnce(retry.promise);

  const {rerender} = await render(true);
  await flush();
  expect(latest.currentProfile).toEqual(PROFILE_A);

  let retrying!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    retrying = latest.retryProfile();
  });
  await rerender(false);
  expect(latest.currentProfile).toBeNull();

  retry.resolve(PROFILE_B);
  await ReactTestRenderer.act(async () => {
    await retrying;
  });
  expect(latest.currentProfile).toBeNull();
  expect(latest.isProfileLoading).toBe(false);
});

test('재시도 중에 껐다 켜서 새 요청이 생기면 옛 재시도 응답은 버리고 로딩은 새 요청이 내린다', async () => {
  const retry = deferred<ProfileInfo>();
  const second = deferred<ProfileInfo>();
  jest
    .mocked(getCurrentProfile)
    .mockResolvedValueOnce(PROFILE_A)
    .mockReturnValueOnce(retry.promise)
    .mockReturnValueOnce(second.promise);

  const {rerender} = await render(true);
  await flush();

  let retrying!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    retrying = latest.retryProfile();
  });
  await rerender(false);
  await rerender(true);
  expect(getCurrentProfile).toHaveBeenCalledTimes(3);
  expect(latest.isProfileLoading).toBe(true);

  retry.resolve(PROFILE_A);
  await ReactTestRenderer.act(async () => {
    await retrying;
  });
  expect(latest.currentProfile).toBeNull();
  expect(latest.isProfileLoading).toBe(true);

  second.resolve(PROFILE_B);
  await flush();
  expect(latest.currentProfile).toEqual(PROFILE_B);
  expect(latest.isProfileLoading).toBe(false);
});

test('첫 요청이 늦고 재시도가 먼저 끝나면 재시도 결과를 지킨다', async () => {
  const first = deferred<ProfileInfo>();
  jest.mocked(getCurrentProfile).mockReturnValueOnce(first.promise).mockResolvedValueOnce(PROFILE_B);

  await render(true);
  await ReactTestRenderer.act(async () => {
    await latest.retryProfile();
  });
  expect(latest.currentProfile).toEqual(PROFILE_B);
  expect(latest.isProfileLoading).toBe(false);

  first.resolve(PROFILE_A);
  await flush();
  expect(latest.currentProfile).toEqual(PROFILE_B);
  expect(latest.isProfileLoading).toBe(false);
});

test('다시 켜진 뒤 도착한 옛 응답은 버리고 새 응답만 쓴다', async () => {
  const first = deferred<ProfileInfo>();
  jest.mocked(getCurrentProfile).mockReturnValueOnce(first.promise).mockResolvedValueOnce(PROFILE_B);

  const {rerender} = await render(true);
  await rerender(false);
  await rerender(true);
  await flush();
  expect(latest.currentProfile).toEqual(PROFILE_B);

  first.resolve(PROFILE_A);
  await flush();
  expect(latest.currentProfile).toEqual(PROFILE_B);
});

test('재시도하는 동안에는 오류와 재시도 중 표시를 함께 두고, 재시도에 성공하면 오류를 비운다', async () => {
  const retry = deferred<ProfileInfo>();
  jest.mocked(getCurrentProfile).mockRejectedValueOnce(ERROR).mockReturnValueOnce(retry.promise);

  await render(true);
  await flush();
  expect(latest.profileError).toEqual(ERROR);
  expect(latest.isProfileLoading).toBe(false);

  let retrying!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    retrying = latest.retryProfile();
  });
  expect(latest.profileError).toEqual(ERROR);
  expect(latest.isProfileLoading).toBe(true);
  expect(latest.currentProfile).toBeNull();

  retry.resolve(PROFILE_A);
  await ReactTestRenderer.act(async () => {
    await retrying;
  });
  expect(latest.currentProfile).toEqual(PROFILE_A);
  expect(latest.profileError).toBeNull();
  expect(latest.isProfileLoading).toBe(false);
});

test('재시도가 다시 실패하면 새 오류로 바꾸고 재시도 중 표시를 내린다', async () => {
  const secondError: ProfileApiError = {...ERROR, errorCode: 'SERVER500_002', message: '다시 실패'};
  jest.mocked(getCurrentProfile).mockRejectedValueOnce(ERROR).mockRejectedValueOnce(secondError);

  await render(true);
  await flush();
  await ReactTestRenderer.act(async () => {
    await latest.retryProfile();
  });
  expect(latest.currentProfile).toBeNull();
  expect(latest.profileError).toEqual(secondError);
  expect(latest.isProfileLoading).toBe(false);
});

test('프로필이 있는 상태에서 다시 읽으면 프로필을 둔 채 로딩을 켜고, 끝나면 새 프로필로 바꾼다', async () => {
  const refresh = deferred<ProfileInfo>();
  jest.mocked(getCurrentProfile).mockResolvedValueOnce(PROFILE_A).mockReturnValueOnce(refresh.promise);

  await render(true);
  await flush();
  expect(latest.currentProfile).toEqual(PROFILE_A);

  let refreshing!: Promise<void>;
  await ReactTestRenderer.act(async () => {
    refreshing = latest.retryProfile();
  });
  expect(latest.currentProfile).toEqual(PROFILE_A);
  expect(latest.profileError).toBeNull();
  expect(latest.isProfileLoading).toBe(true);

  refresh.resolve(PROFILE_B);
  await ReactTestRenderer.act(async () => {
    await refreshing;
  });
  expect(latest.currentProfile).toEqual(PROFILE_B);
  expect(latest.isProfileLoading).toBe(false);
});
