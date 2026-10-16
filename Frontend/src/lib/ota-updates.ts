export type OtaAction = 'skip' | 'reload' | 'check';

/** 같은 포그라운드 세션에서 서버에 너무 자주 묻지 않도록 두는 최소 간격입니다. */
export const OTA_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * 앱이 포그라운드로 돌아온 순간 무엇을 할지 정합니다.
 * 받아 둔 업데이트가 있으면 그 순간에 다시 시작해 적용합니다. 화면이 막 다시 뜨는 때라 덜 거슬립니다.
 * 없으면 마지막 확인에서 일정 시간이 지났을 때만 서버에 새 번들이 있는지 묻습니다.
 * expo-updates가 꺼진 개발 빌드에서는 아무 일도 하지 않습니다.
 */
export function decideOtaAction(input: {
  isEnabled: boolean;
  hasFetchedUpdate: boolean;
  lastCheckedAt: number | null;
  now: number;
  intervalMs?: number;
}): OtaAction {
  if (!input.isEnabled) return 'skip';
  if (input.hasFetchedUpdate) return 'reload';
  const intervalMs = input.intervalMs ?? OTA_CHECK_INTERVAL_MS;
  if (input.lastCheckedAt !== null && input.now - input.lastCheckedAt < intervalMs) {
    return 'skip';
  }
  return 'check';
}
