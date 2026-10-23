import AsyncStorage from '@react-native-async-storage/async-storage';

const SIGNED_IN_ON_THIS_INSTALL_STORAGE_KEY =
  '@yeogidam/signed-in-on-this-install';

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
