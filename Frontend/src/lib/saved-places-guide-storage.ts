import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_PLACES_GUIDE_DISMISSED_KEY = 'saved-places-guide-dismissed-v1';

export async function hasDismissedSavedPlacesGuide() {
  return (
    (await AsyncStorage.getItem(SAVED_PLACES_GUIDE_DISMISSED_KEY)) === 'true'
  );
}

export async function dismissSavedPlacesGuide() {
  await AsyncStorage.setItem(SAVED_PLACES_GUIDE_DISMISSED_KEY, 'true');
}
