import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_SEEN_HISTORY_KEY = '@yeogidam/last-seen-history-id';

export type HistoryNotificationSnapshot = {
  id: string;
  status: string;
};

export async function getLastSeenHistorySnapshot(): Promise<HistoryNotificationSnapshot | null> {
  try {
    const value = await AsyncStorage.getItem(LAST_SEEN_HISTORY_KEY);
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as HistoryNotificationSnapshot;
      if (parsed?.id && parsed?.status) return parsed;
    } catch {
      // Migrate the previous id-only value below.
    }
    return {id: value, status: ''};
  } catch {
    return null;
  }
}

export async function setLastSeenHistorySnapshot(
  snapshot: HistoryNotificationSnapshot,
): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SEEN_HISTORY_KEY, JSON.stringify(snapshot));
  } catch {
    // Keep the notification usable when storage is unavailable.
  }
}
