import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Session} from '@supabase/supabase-js';

import {getReelProcessingStatus} from '../src/entities/content/api';
import {supabase} from '../src/lib/auth/supabase';
import {
  beginGuestOnboardingTransfer,
  cancelGuestOnboardingTransfer,
  resumeGuestOnboardingTransfer,
} from '../src/entities/onboarding/transfer';

jest.mock('../src/lib/auth/supabase', () => ({
  supabase: {
    functions: {invoke: jest.fn()},
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(() => Promise.resolve({data: null, error: null})),
    })),
  },
}));

jest.mock('../src/entities/content/api', () => ({
  getReelProcessingStatus: jest.fn(),
}));

const STORAGE_KEY = '@yeogidam/guest-onboarding-transfer';
const now = '2026-10-12T12:00:00.000Z';

function session(createdAt: string, lastSignInAt = now, id = 'new-user') {
  return {
    user: {id, created_at: createdAt, last_sign_in_at: lastSignInAt},
  } as Session;
}

beforeEach(async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
  await AsyncStorage.removeItem(STORAGE_KEY);
  jest.clearAllMocks();
});

afterEach(() => jest.restoreAllMocks());

test('신규 회원에게 v1 저장 요청을 보내고 완료 후 전환 기록을 지운다', async () => {
  await beginGuestOnboardingTransfer();
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({
    data: {reelId: 'gunja-reel', status: 'COMPLETED'},
    error: null,
  });

  expect(await resumeGuestOnboardingTransfer(session(now))).toBe(true);
  expect(supabase.functions.invoke).toHaveBeenCalledWith('save-instagram-reel', {
    body: {
      instagramUrl: 'https://www.instagram.com/p/Db4gRWqkuUg/',
      source: 'url_input',
      forceReprocess: false,
    },
  });
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('기존 회원 로그인에는 군자역 게시물을 요청하지 않는다', async () => {
  await beginGuestOnboardingTransfer();

  expect(await resumeGuestOnboardingTransfer(session('2026-09-01T12:00:00.000Z'))).toBe(false);
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('실패한 요청은 같은 회원에 묶어 두고 재실행 시 다시 시도한다', async () => {
  await beginGuestOnboardingTransfer();
  (supabase.functions.invoke as jest.Mock)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({data: {reelId: 'gunja-reel', status: 'COMPLETED'}, error: null});

  await expect(resumeGuestOnboardingTransfer(session(now))).rejects.toThrow('offline');
  expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!)).toMatchObject({
    userId: 'new-user',
  });
  expect(await resumeGuestOnboardingTransfer(session(now))).toBe(true);
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});

test('처리 중인 게시물은 상태를 확인하고 저장 요청을 중복하지 않는다', async () => {
  await beginGuestOnboardingTransfer();
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({
    data: {reelId: 'gunja-reel', status: 'PROCESSING'},
    error: null,
  });
  (getReelProcessingStatus as jest.Mock).mockResolvedValue({
    processing_status: 'COMPLETED',
  });

  const first = resumeGuestOnboardingTransfer(session(now));
  const second = resumeGuestOnboardingTransfer(session(now));
  expect(first).toBe(second);
  expect(await first).toBe(true);
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  expect(getReelProcessingStatus).toHaveBeenCalledWith('gunja-reel');
});

test('응답이 유실된 요청은 서버의 기존 게시물을 찾아 중복 요청하지 않는다', async () => {
  await beginGuestOnboardingTransfer();
  (supabase.functions.invoke as jest.Mock).mockRejectedValueOnce(new Error('response lost'));
  await expect(resumeGuestOnboardingTransfer(session(now))).rejects.toThrow('response lost');

  (supabase.from as jest.Mock).mockReturnValueOnce({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(() => Promise.resolve({
      data: {id: 'existing-gunja-reel', processing_status: 'COMPLETED'},
      error: null,
    })),
  });
  (getReelProcessingStatus as jest.Mock).mockResolvedValue({
    processing_status: 'COMPLETED',
  });

  expect(await resumeGuestOnboardingTransfer(session(now))).toBe(true);
  expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
  expect(getReelProcessingStatus).toHaveBeenCalledWith('existing-gunja-reel');
});

test('로그인을 취소하면 아직 계정에 묶이지 않은 전환 기록을 지운다', async () => {
  await beginGuestOnboardingTransfer();
  await cancelGuestOnboardingTransfer();
  expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
});
