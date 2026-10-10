import AsyncStorage from '@react-native-async-storage/async-storage';

import { clearAuthSession, clearSecureAuthStorage } from './auth/authStorage';
import { clearShareResult, getShareResults } from './share-intent';

const FIRST_RUN_CLEANUP_STORAGE_KEY = '@yeogidam/first-run-cleanup-1.1.1';
/** 1.1.0의 히스토리 배지 스냅샷이며 Supabase 릴스 id를 담고 있습니다. */
const LEGACY_HISTORY_SNAPSHOT_STORAGE_KEY = '@yeogidam/last-seen-history-id';

/** 1.1.0 서버가 처리를 끝낸 결과만 지웁니다. 남은 결과는 resumeWaitingShares가 새 서버로 보냅니다. */
async function clearFinishedShareResults() {
  const results = await getShareResults();

  await Promise.all(
    results
      .filter(
        result =>
          result.transferStatus === 'API_SUCCEEDED' ||
          result.transferStatus === 'API_FAILED',
      )
      .map(result => clearShareResult(result.requestId)),
  );
}

/**
 * 1.1.0이 남긴 로컬 상태를 1.1.1 첫 실행 때 한 번 지웁니다. 대상은 Keychain의 옛 Supabase 세션,
 * 네이티브 공유 세션, 1.1.0 서버가 처리를 끝낸 공유 결과, 히스토리 배지 스냅샷입니다.
 *
 * 다시 돌면 첫 실행 뒤에 로그인한 새 세션까지 지우므로 끝났다는 표시를 먼저 남기고, 표시를
 * 남기지 못하면 이번 실행에서는 건너뜁니다. 한 단계가 실패해도 나머지 단계는 진행하며, 던지지
 * 않습니다.
 */
export async function runFirstRunCleanup(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(FIRST_RUN_CLEANUP_STORAGE_KEY)) {
      return;
    }

    await AsyncStorage.setItem(FIRST_RUN_CLEANUP_STORAGE_KEY, 'true');
  } catch {
    // 표시를 남기지 못하면 다음 실행에서 다시 시도합니다.
    return;
  }

  await Promise.allSettled([
    clearSecureAuthStorage(),
    clearAuthSession(),
    clearFinishedShareResults(),
    AsyncStorage.removeItem(LEGACY_HISTORY_SNAPSHOT_STORAGE_KEY),
  ]);
}
