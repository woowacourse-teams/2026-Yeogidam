import {NativeEventEmitter, NativeModules} from 'react-native';
import Config from 'react-native-config';

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
  installationId?: string;
  getPendingShare(): Promise<NativeShareIntentPayload | null>;
  clearPendingShare(shareId: string | null): Promise<void>;
  setShareSession?(session: NativeShareSession | null): Promise<void>;
  getShareSession?(): Promise<NativeShareSession | null>;
  /**
   * Refreshes inside the native lock shared with the share extension. Under the lock
   * it re-reads the store, calls the server only when the stored access token is the
   * rejected one or expires within 60 seconds, and saves the new pair before resolving.
   */
  ensureAccessToken?(rejectedAccessToken: string | null): Promise<NativeAccessTokenResult>;
  resumeWaitingShares?(): Promise<void>;
  setSupabaseConfiguration?(
    url: string,
    publishableKey: string,
  ): Promise<void>;
  setPostHogConfiguration?(projectToken: string, host: string): Promise<void>;
  getShareResult?(): Promise<NativeShareResult | null>;
  getShareResults?(): Promise<NativeShareResult[]>;
  clearShareResult?(requestId: string | null): Promise<void>;
  getPendingShareAnalyticsEvents?(): Promise<NativeShareAnalyticsEvent[]>;
  acknowledgeShareAnalyticsEvent?(id: string): Promise<void>;
};

export type NativeShareAnalyticsEvent = {
  id: string;
  uuid?: string;
  name: string;
  share_id: string;
  distinct_id?: string;
  occurred_at: number;
  properties: Record<string, string | number | boolean>;
};

/** The single session store shared by the app and the share extension. expiresAt is epoch seconds and userId holds the server member id as a string. */
export type NativeShareSession = {accessToken: string; refreshToken: string; expiresAt: number; userId: string};
/** Same outcomes as the native ShareAuth. LOGIN_REQUIRED means the session has ended and the store is empty; the WAITING_* outcomes keep the session. */
export type NativeAccessTokenResult =
  | {status: 'READY'; accessToken: string}
  | {status: 'LOGIN_REQUIRED'}
  | {status: 'WAITING_FOR_NETWORK'}
  | {status: 'WAITING_FOR_AUTH'};
export type ShareTransferStatus = 'SAVED' | 'WAITING_FOR_AUTH' | 'WAITING_FOR_NETWORK' | 'LOGIN_REQUIRED' | 'QUEUED' | 'REQUESTING' | 'API_SUCCEEDED' | 'API_FAILED';
export type NativeShareResult = {requestId?: string; requestSentAt?: number; url: string; rawSharedText?: string; status: 'PENDING'|'PROCESSING'|'COMPLETED'|'FAILED'; transferStatus?: ShareTransferStatus; authReason?: string; reelId?: string; failureReason?: string; retryable?: boolean; updatedAt: number; receivedAt?: number; queuedAt?: number; apiAcceptedAt?: number; transferFinishedAt?: number; reused?: boolean; saveMode?: 'REVIEW_QUEUE' | 'AUTO_SAVE'};

export type SharedContentSubscription = {
  remove: () => void;
};

const SHARE_INTENT_EVENT_NAME = 'shareIntentReceived';

const nativeShareIntentModule: NativeShareIntentModule | undefined =
  NativeModules.ShareIntentModule as NativeShareIntentModule | undefined;

export function getInstallationId(): string | undefined {
  const value = nativeShareIntentModule?.installationId?.trim();
  return value || undefined;
}

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

export async function syncShareAnalyticsConfiguration(): Promise<void> {
  await nativeShareIntentModule?.setPostHogConfiguration?.(
    Config.POSTHOG_PROJECT_TOKEN ?? '',
    Config.POSTHOG_HOST ?? '',
  );
}
export async function getShareSession(): Promise<NativeShareSession | null> {
  return nativeShareIntentModule?.getShareSession?.() ?? null;
}
export async function setShareSession(session: NativeShareSession | null): Promise<void> {
  await nativeShareIntentModule?.setShareSession?.(session);
}
/** Returns null on a binary built before the native ensureAccessToken bridge. */
export async function ensureNativeAccessToken(rejectedAccessToken: string | null): Promise<NativeAccessTokenResult | null> {
  return nativeShareIntentModule?.ensureAccessToken?.(rejectedAccessToken) ?? null;
}
export async function resumeWaitingShares(): Promise<void> {
  await nativeShareIntentModule?.resumeWaitingShares?.();
}
export async function getPendingShareAnalyticsEvents(): Promise<NativeShareAnalyticsEvent[]> {
  return nativeShareIntentModule?.getPendingShareAnalyticsEvents?.() ?? [];
}
export async function acknowledgeShareAnalyticsEvent(id: string): Promise<void> {
  await nativeShareIntentModule?.acknowledgeShareAnalyticsEvent?.(id);
}
export async function getShareResult() { return nativeShareIntentModule?.getShareResult?.() ?? null; }
export async function getShareResults(): Promise<NativeShareResult[]> {
  const results = await nativeShareIntentModule?.getShareResults?.();
  if (results) {
    return results;
  }

  // Compatibility with an app binary built before the multi-result bridge.
  const result = await getShareResult();
  return result ? [result] : [];
}
export async function clearShareResult(requestId?: string) {
  await nativeShareIntentModule?.clearShareResult?.(requestId ?? null);
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

      clearPendingSharedContent(payload?.id).catch(() => undefined);

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
