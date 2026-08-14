import {NativeEventEmitter, NativeModules} from 'react-native';

export type SharedContent = {
  type: 'url' | 'text';
  value: string;
};

type NativeShareIntentPayload = {
  id: string;
  text: string;
  kind: 'url' | 'text';
};

type NativeShareIntentModule = {
  getPendingShare(): Promise<NativeShareIntentPayload | null>;
  clearPendingShare(shareId: string | null): Promise<void>;
};

export type SharedContentSubscription = {
  remove: () => void;
};

const SHARE_INTENT_EVENT_NAME = 'shareIntentReceived';

const nativeShareIntentModule: NativeShareIntentModule | undefined =
  NativeModules.ShareIntentModule as NativeShareIntentModule | undefined;

const shareIntentEmitter =
  nativeShareIntentModule != null
    ? new NativeEventEmitter(NativeModules.ShareIntentModule)
    : null;

function normalizeSharedContent(
  payload: NativeShareIntentPayload | null,
): SharedContent | null {
  if (!payload) {
    return null;
  }

  const value = payload.text.trim();

  if (!value) {
    return null;
  }

  return {
    type: payload.kind === 'url' ? 'url' : 'text',
    value,
  };
}

async function clearPendingSharedContent(shareId?: string): Promise<void> {
  if (!nativeShareIntentModule) {
    return;
  }

  await nativeShareIntentModule.clearPendingShare(shareId ?? null);
}

export async function getInitialSharedContent(): Promise<SharedContent | null> {
  if (!nativeShareIntentModule) {
    return null;
  }

  const payload = await nativeShareIntentModule.getPendingShare();

  if (!payload) {
    return null;
  }

  await clearPendingSharedContent(payload.id);
  return normalizeSharedContent(payload);
}

export function addSharedContentListener(
  listener: (sharedContent: SharedContent) => void,
): SharedContentSubscription {
  if (!shareIntentEmitter) {
    return {
      remove: () => {},
    };
  }

  const subscription = shareIntentEmitter.addListener(
    SHARE_INTENT_EVENT_NAME,
    (payload: NativeShareIntentPayload) => {
      const sharedContent = normalizeSharedContent(payload);

      void clearPendingSharedContent(payload?.id);

      if (!sharedContent) {
        return;
      }

      listener(sharedContent);
    },
  );

  return {
    remove: () => subscription.remove(),
  };
}
