import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Keychain from 'react-native-keychain';

import { runFirstRunCleanup } from '../src/lib/first-run-cleanup';
import type {
  NativeShareResult,
  NativeShareSession,
  ShareTransferStatus,
} from '../src/lib/share-intent';

const CLEANUP_KEY = '@yeogidam/first-run-cleanup-1.1.1';
const HISTORY_SNAPSHOT_KEY = '@yeogidam/last-seen-history-id';

/** 네이티브 공유 세션과 공유 결과 저장소를 메모리로 흉내 냅니다. */
const mockNative: {
  session: NativeShareSession | null;
  results: NativeShareResult[];
} = { session: null, results: [] };

jest.mock('../src/lib/share-intent', () => ({
  getShareSession: () => Promise.resolve(mockNative.session),
  setShareSession: (session: typeof mockNative.session) => {
    mockNative.session = session;
    return Promise.resolve();
  },
  getShareResults: () => Promise.resolve(mockNative.results),
  clearShareResult: (requestId?: string) => {
    mockNative.results = mockNative.results.filter(
      result => result.requestId !== requestId,
    );
    return Promise.resolve();
  },
}));

/** 1.1.0이 남긴 Supabase 세션입니다. userId가 uuid입니다. */
const legacySession: NativeShareSession = {
  accessToken: 'supabase-access-token',
  refreshToken: 'supabase-refresh-token',
  expiresAt: 1_760_000_000,
  userId: '6f1c2b0e-7d3a-4b8e-9a51-2f6d8c4e1a90',
};

function shareResult(
  requestId: string,
  transferStatus: ShareTransferStatus,
): NativeShareResult {
  return {
    requestId,
    url: 'https://www.instagram.com/reel/C1seongsu/',
    status: 'COMPLETED',
    transferStatus,
    updatedAt: 1_760_000_000_000,
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockNative.session = null;
  mockNative.results = [];
  await AsyncStorage.removeItem(CLEANUP_KEY);
  await AsyncStorage.removeItem(HISTORY_SNAPSHOT_KEY);
});

describe('first run cleanup', () => {
  it('clears the 1.1.0 session, finished share results and history snapshot only once', async () => {
    mockNative.session = legacySession;
    mockNative.results = [
      shareResult('succeeded', 'API_SUCCEEDED'),
      shareResult('failed', 'API_FAILED'),
      shareResult('waiting', 'WAITING_FOR_AUTH'),
      shareResult('login', 'LOGIN_REQUIRED'),
    ];
    await AsyncStorage.setItem(
      HISTORY_SNAPSHOT_KEY,
      JSON.stringify({
        id: '2b7e9f40-5c1d-4e3a-8f62-9d0a1c3b5e77',
        status: 'COMPLETED',
      }),
    );

    await runFirstRunCleanup();

    expect(Keychain.resetGenericPassword).toHaveBeenCalledTimes(4);
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: 'com.yeogidamm.app.supabase.supabase.auth.token',
    });
    expect(mockNative.session).toBeNull();
    // 서버에 닿지 못한 공유는 로그인 뒤 새 서버로 다시 보내므로 남습니다.
    expect(mockNative.results.map(result => result.requestId)).toEqual([
      'waiting',
      'login',
    ]);
    await expect(
      AsyncStorage.getItem(HISTORY_SNAPSHOT_KEY),
    ).resolves.toBeNull();

    // 다음 실행에서는 첫 실행 뒤에 로그인한 세션을 지우지 않습니다.
    const serverSession: NativeShareSession = {
      accessToken: 'server-access-token',
      refreshToken: 'server-refresh-token',
      expiresAt: 1_760_001_800,
      userId: '7',
    };
    mockNative.session = serverSession;

    await runFirstRunCleanup();

    expect(mockNative.session).toEqual(serverSession);
    expect(Keychain.resetGenericPassword).toHaveBeenCalledTimes(4);
  });

  it('waits for the next launch when it cannot record that it ran', async () => {
    mockNative.session = legacySession;
    jest
      .mocked(AsyncStorage.setItem)
      .mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(runFirstRunCleanup()).resolves.toBeUndefined();

    expect(mockNative.session).toEqual(legacySession);
    expect(Keychain.resetGenericPassword).not.toHaveBeenCalled();

    await runFirstRunCleanup();

    expect(mockNative.session).toBeNull();
  });

  it('keeps clearing the other leftovers when one step fails', async () => {
    mockNative.session = legacySession;
    jest
      .mocked(Keychain.resetGenericPassword)
      .mockRejectedValueOnce(new Error('keychain unavailable'));

    await expect(runFirstRunCleanup()).resolves.toBeUndefined();

    expect(mockNative.session).toBeNull();
  });
});
