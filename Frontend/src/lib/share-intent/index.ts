import {
  NativeEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';

export type ShareIntentPayload = {
  id: string;
  action: string;
  mimeType: string;
  text: string;
  subject: string | null;
  kind: 'url' | 'text';
  receivedAt: number;
};

type NativeShareIntentModule = {
  getPendingShare(): Promise<ShareIntentPayload | null>;
  clearPendingShare(shareId: string | null): Promise<void>;
};

export type ShareIntentSubscription = {
  remove: () => void;
};

const SHARE_INTENT_EVENT_NAME = 'shareIntentReceived';

const nativeShareIntentModule: NativeShareIntentModule | undefined =
  Platform.OS === 'android'
    ? (NativeModules.ShareIntentModule as NativeShareIntentModule | undefined)
    : undefined;

const shareIntentEmitter =
  nativeShareIntentModule != null
    ? new NativeEventEmitter(NativeModules.ShareIntentModule)
    : null;

export async function getPendingSharedContent(): Promise<ShareIntentPayload | null> {
  if (!nativeShareIntentModule) {
    return null;
  }

  return nativeShareIntentModule.getPendingShare();
}

export async function clearPendingSharedContent(shareId?: string): Promise<void> {
  if (!nativeShareIntentModule) {
    return;
  }

  await nativeShareIntentModule.clearPendingShare(shareId ?? null);
}

export async function consumePendingSharedContent(): Promise<ShareIntentPayload | null> {
  const sharedContent = await getPendingSharedContent();

  if (!sharedContent) {
    return null;
  }

  await clearPendingSharedContent(sharedContent.id);
  return sharedContent;
}

export function addSharedContentListener(
  listener: (sharedContent: ShareIntentPayload) => void,
): ShareIntentSubscription {
  if (!shareIntentEmitter) {
    return {
      remove: () => {},
    };
  }

  const subscription = shareIntentEmitter.addListener(
    SHARE_INTENT_EVENT_NAME,
    listener,
  );

  return {
    remove: () => subscription.remove(),
  };
}
