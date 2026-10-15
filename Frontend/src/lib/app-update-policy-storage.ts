import AsyncStorage from '@react-native-async-storage/async-storage';

const DISMISSED_RECOMMENDED_VERSION_KEY =
  '@yeogidam/dismissed-recommended-update-version';

export async function getDismissedRecommendedVersion(): Promise<string | null> {
  try {
    const version = await AsyncStorage.getItem(DISMISSED_RECOMMENDED_VERSION_KEY);
    return version?.trim() || null;
  } catch {
    return null;
  }
}

export async function rememberDismissedRecommendedVersion(
  version: string,
): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_RECOMMENDED_VERSION_KEY, version);
  } catch {
    // 저장할 수 없어도 이번 실행 중에는 닫은 안내를 다시 표시하지 않습니다.
  }
}
