import AsyncStorage from '@react-native-async-storage/async-storage';

const SEARCH_HISTORY_STORAGE_KEY = '@yeogidam/recent-searches';

export async function getRecentSearches(): Promise<string[]> {
  try {
    const storedValue = await AsyncStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  } catch {
    return [];
  }
}

export async function setRecentSearches(values: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      SEARCH_HISTORY_STORAGE_KEY,
      JSON.stringify(values),
    );
  } catch {
    // Ignore storage failures and keep the in-memory search history usable.
  }
}
