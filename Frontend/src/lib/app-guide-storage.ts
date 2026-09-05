import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_GUIDE_COMPLETED_STORAGE_KEY = '@yeogidam/app-guide-completed';

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
