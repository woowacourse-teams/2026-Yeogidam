import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_EVENT_NOTICE_KEY_PREFIX = '@yeogidam/dismissed-event-notice/';

export async function hasDismissedEventNotice(noticeId: string): Promise<boolean> {
  try {
    return (
      (await AsyncStorage.getItem(DISMISSED_EVENT_NOTICE_KEY_PREFIX + noticeId)) ===
      'true'
    );
  } catch {
    return false;
  }
}

export async function rememberDismissedEventNotice(noticeId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_EVENT_NOTICE_KEY_PREFIX + noticeId, 'true');
  } catch {
    // 저장할 수 없어도 이번 실행 중에는 닫은 안내를 다시 표시하지 않습니다.
  }
}
