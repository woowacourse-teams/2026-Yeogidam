import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_GUIDE_COMPLETED_STORAGE_KEY = '@yeogidam/app-guide-completed';
const SIGNED_IN_ON_THIS_INSTALL_STORAGE_KEY =
  '@yeogidam/signed-in-on-this-install';

export async function hasCompletedAppGuide(): Promise<boolean> {
  try {
    return (
      (await AsyncStorage.getItem(APP_GUIDE_COMPLETED_STORAGE_KEY)) === 'true'
    );
  } catch {
    return false;
  }
}

export async function completeAppGuide(): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_GUIDE_COMPLETED_STORAGE_KEY, 'true');
  } catch {
    // The guide remains usable even when persistent storage is unavailable.
  }
}

export async function hasSignedInOnThisInstall(): Promise<boolean> {
  try {
    return (
      (await AsyncStorage.getItem(SIGNED_IN_ON_THIS_INSTALL_STORAGE_KEY)) ===
      'true'
    );
  } catch {
    return false;
  }
}

export async function rememberSignInOnThisInstall(): Promise<void> {
  try {
    await AsyncStorage.setItem(SIGNED_IN_ON_THIS_INSTALL_STORAGE_KEY, 'true');
  } catch {
    // 저장에 실패해도 로그인과 온보딩 진행은 계속할 수 있습니다.
  }
}
