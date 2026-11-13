import AsyncStorage from '@react-native-async-storage/async-storage';

const SEEN_WHATS_NEW_KEY_PREFIX = '@yeogidam/seen-whats-new/';

export async function hasSeenWhatsNew(id: string): Promise<boolean> {
  try {
    return (
      (await AsyncStorage.getItem(SEEN_WHATS_NEW_KEY_PREFIX + id)) === 'true'
    );
  } catch {
    return false;
  }
}

export async function rememberSeenWhatsNew(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(SEEN_WHATS_NEW_KEY_PREFIX + id, 'true');
  } catch {
    // 저장할 수 없어도 이번 실행 중에는 다시 표시하지 않습니다.
  }
}
