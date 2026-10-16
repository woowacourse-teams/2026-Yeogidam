import AsyncStorage from '@react-native-async-storage/async-storage';

import {ApiError} from '../src/lib/api/errors';
import {
  beginGuestOnboardingTransfer,
  cancelGuestOnboardingTransfer,
  resumeGuestOnboardingTransfer,
} from '../src/entities/onboarding/transfer';

const mockRequest = jest.fn();

jest.mock('../src/lib/api/spring-client', () => ({
  createSpringApiClient: jest.fn(() => ({
    request: (...args: unknown[]) => mockRequest(...args),
  })),
}));

const STORAGE_KEY = '@yeogidam/guest-onboarding-transfer';
const ONBOARDING_KAKAO_PLACE_IDS = [
  '1775568752',
  '137070444',
  '337953507',
  '98016856',
  '1107844606',
];

function respond({shares = [] as unknown[], transfer}: {
  shares?: unknown[];
  transfer?: () => Promise<unknown>;
} = {}) {
  mockRequest.mockImplementation((path: string) => {
    if (path === '/api/v1/shares') {
      return Promise.resolve({sharedMedias: shares, nextCursor: null});
    }
    if (path === '/api/v1/onboarding/saved-places') {
      return transfer ? transfer() : Promise.resolve({sharedMediaId: 42});
    }
    return Promise.reject(new Error(`unexpected ${path}`));
  });
}

const transferCalls = () =>
  mockRequest.mock.calls.filter(([path]) => path === '/api/v1/onboarding/saved-places');

beforeEach(async () => {
  await AsyncStorage.removeItem(STORAGE_KEY);
  mockRequest.mockReset();
});

test('새 회원에게 온보딩 장소 ID를 보내고 전환 기록을 지운다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  respond();

  await expect(resumeGuestOnboardingTransfer('7')).resolves.toBe(true);

  expect(mockRequest).toHaveBeenCalledWith('/api/v1/onboarding/saved-places', {
    method: 'POST',
    body: {kakaoPlaceIds: ONBOARDING_KAKAO_PLACE_IDS},
  });
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('비회원 로그인 기록이 없으면 아무것도 보내지 않는다', async () => {
  respond();

  await expect(resumeGuestOnboardingTransfer('7')).resolves.toBe(false);
  expect(mockRequest).not.toHaveBeenCalled();
});

test('공유 이력이 있는 기존 회원은 옮기지 않고 기록을 지운다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  respond({shares: [{sharedMediaId: 1}]});

  await expect(resumeGuestOnboardingTransfer('7')).resolves.toBe(false);
  expect(transferCalls()).toHaveLength(0);
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('네트워크 실패는 기록을 남겨 다음 실행에 같은 회원으로 다시 보낸다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  respond({transfer: () => Promise.reject(new ApiError({kind: 'network', message: 'offline'}))});

  await expect(resumeGuestOnboardingTransfer('7')).rejects.toBeInstanceOf(ApiError);
  expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!)).toMatchObject({memberId: '7'});

  // 재시도 전에 다른 공유가 생겨도 이미 새 회원으로 정한 기록을 따른다.
  respond({shares: [{sharedMediaId: 1}]});
  await expect(resumeGuestOnboardingTransfer('8')).resolves.toBe(false);
  await expect(resumeGuestOnboardingTransfer('7')).resolves.toBe(true);
  // 실패한 첫 요청과 재시도, 두 번 보냈다.
  expect(transferCalls()).toHaveLength(2);
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('장소 ID가 서버 시드와 다르면(400) 다시 보내지 않도록 기록을 지운다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  respond({
    transfer: () => Promise.reject(new ApiError({
      kind: 'http',
      status: 400,
      errorCode: 'PLACE400_002',
      message: '요청 장소를 찾을 수 없습니다.',
    })),
  });

  await expect(resumeGuestOnboardingTransfer('7')).rejects.toMatchObject({
    errorCode: 'PLACE400_002',
  });
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('로그인을 취소하면 회원이 정해지지 않은 기록만 지운다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  await cancelGuestOnboardingTransfer();
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();

  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({startedAt: 1, memberId: '7'}));
  await cancelGuestOnboardingTransfer();
  expect(await AsyncStorage.getItem(STORAGE_KEY)).not.toBeNull();
});

test('같은 회원의 동시 호출은 요청을 한 번만 보낸다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  respond();

  const [first, second] = await Promise.all([
    resumeGuestOnboardingTransfer('7'),
    resumeGuestOnboardingTransfer('7'),
  ]);

  expect(first).toBe(true);
  expect(second).toBe(true);
  expect(transferCalls()).toHaveLength(1);
});

test('비회원이 지운 장소는 빼고 남은 장소만 보낸다', async () => {
  await beginGuestOnboardingTransfer(['337953507', '98016856']);
  respond();

  await expect(resumeGuestOnboardingTransfer('7')).resolves.toBe(true);
  expect(mockRequest).toHaveBeenCalledWith('/api/v1/onboarding/saved-places', {
    method: 'POST',
    body: {kakaoPlaceIds: ['337953507', '98016856']},
  });
});

test('비회원이 장소를 모두 지웠으면 보내지 않고 기록을 지운다', async () => {
  await beginGuestOnboardingTransfer([]);
  respond();

  await expect(resumeGuestOnboardingTransfer('7')).resolves.toBe(false);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('장소 목록이 없는 이전 버전 기록은 온보딩 장소 전체를 보낸다', async () => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({startedAt: 1}));
  respond();

  await expect(resumeGuestOnboardingTransfer('7')).resolves.toBe(true);
  expect(mockRequest).toHaveBeenCalledWith('/api/v1/onboarding/saved-places', {
    method: 'POST',
    body: {kakaoPlaceIds: ONBOARDING_KAKAO_PLACE_IDS},
  });
});

test('로그인 응답이 새 회원이라고 하면 공유 이력을 조회하지 않고 옮긴다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  respond({shares: [{sharedMediaId: 1}]});

  await expect(resumeGuestOnboardingTransfer('7', true)).resolves.toBe(true);
  expect(mockRequest).not.toHaveBeenCalledWith('/api/v1/shares');
  expect(transferCalls()).toHaveLength(1);
});

test('로그인 응답이 기존 회원이라고 하면 아무 요청 없이 기록을 지운다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  respond();

  await expect(resumeGuestOnboardingTransfer('7', false)).resolves.toBe(false);
  expect(mockRequest).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('새 회원으로 정한 뒤 이관이 실패하면 다음 실행에 다시 판별하지 않고 다시 보낸다', async () => {
  await beginGuestOnboardingTransfer(ONBOARDING_KAKAO_PLACE_IDS);
  respond({transfer: () => Promise.reject(new ApiError({kind: 'network', message: 'offline'}))});

  await expect(resumeGuestOnboardingTransfer('7', true)).rejects.toBeInstanceOf(ApiError);
  expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!)).toMatchObject({memberId: '7'});

  // 다음 실행에는 로그인 응답이 없어 신규 여부를 넘기지 않는다.
  respond({shares: [{sharedMediaId: 1}]});
  await expect(resumeGuestOnboardingTransfer('7')).resolves.toBe(true);
  expect(mockRequest).not.toHaveBeenCalledWith('/api/v1/shares');
  expect(transferCalls()).toHaveLength(2);
});
