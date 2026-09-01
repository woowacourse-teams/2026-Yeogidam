import AsyncStorage from '@react-native-async-storage/async-storage';

const INBOX_SELECTION_STORAGE_KEY = '@yeogidam/inbox-selection';

export type InboxSelection = {
  placeIds: string[];
};

const EMPTY_SELECTION: InboxSelection = { placeIds: [] };

export async function getInboxSelection(): Promise<InboxSelection> {
  try {
    const storedValue = await AsyncStorage.getItem(INBOX_SELECTION_STORAGE_KEY);
    if (!storedValue) {
      return EMPTY_SELECTION;
    }

    const parsedValue = JSON.parse(storedValue) as Partial<InboxSelection>;
    return {
      placeIds: Array.isArray(parsedValue.placeIds)
        ? parsedValue.placeIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [],
    };
  } catch {
    return EMPTY_SELECTION;
  }
}

export async function setInboxSelection(
  selection: InboxSelection,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      INBOX_SELECTION_STORAGE_KEY,
      JSON.stringify(selection),
    );
  } catch {
    // Ignore storage failures and keep the current selection usable.
  }
}
