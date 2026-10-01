import {NativeEventEmitter, NativeModules} from 'react-native';
import type {Session} from '@supabase/supabase-js';

import {SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase} from '../auth/supabase';

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
  setShareSession?(session: NativeShareSession | null): Promise<void>;
  getShareSession?(): Promise<NativeShareSession | null>;
  resumeWaitingShares?(): Promise<void>;
  setSupabaseConfiguration?(
    url: string,
    publishableKey: string,
  ): Promise<void>;
  getShareResult?(): Promise<NativeShareResult | null>;
  getShareResults?(): Promise<NativeShareResult[]>;
  clearShareResult?(requestId: string | null): Promise<void>;
};

export type NativeShareSession = {accessToken: string; refreshToken: string; expiresAt: number; userId: string};
export type ShareTransferStatus = 'SAVED' | 'WAITING_FOR_AUTH' | 'WAITING_FOR_NETWORK' | 'LOGIN_REQUIRED' | 'QUEUED' | 'REQUESTING' | 'API_SUCCEEDED' | 'API_FAILED';
export type NativeShareResult = {requestId?: string; requestSentAt?: number; url: string; rawSharedText?: string; status: 'PENDING'|'PROCESSING'|'COMPLETED'|'FAILED'; transferStatus?: ShareTransferStatus; authReason?: string; reelId?: string; failureReason?: string; retryable?: boolean; updatedAt: number; receivedAt?: number; queuedAt?: number; apiAcceptedAt?: number; transferFinishedAt?: number; reused?: boolean; saveMode?: 'REVIEW_QUEUE' | 'AUTO_SAVE'};

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

export async function syncShareSession(session: Session | null) {
  await nativeShareIntentModule?.setSupabaseConfiguration?.(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
  );
  await nativeShareIntentModule?.setShareSession?.(session ? {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? 0,
    userId: session.user.id,
  } : null);
}
export async function getShareSession(): Promise<NativeShareSession | null> {
  return nativeShareIntentModule?.getShareSession?.() ?? null;
}
export async function reconcileShareSession(): Promise<void> {
  const shared = await getShareSession();
  if (!shared) return;
  const {data: {session}} = await supabase.auth.getSession();
  if (session && session.user.id !== shared.userId) return;
  if (!shared.accessToken && shared.refreshToken) {
    if (session?.access_token && (session.expires_at ?? 0) > Date.now() / 1000 + 60) {
      await syncShareSession(session);
      return;
    }
    const {error} = await supabase.auth.refreshSession({
      refresh_token: shared.refreshToken,
    });
    if (error) throw error;
    return;
  }
  if (!session || shared.expiresAt > (session.expires_at ?? 0)) {
    const {error} = await supabase.auth.setSession({
      access_token: shared.accessToken,
      refresh_token: shared.refreshToken,
    });
    if (error) throw error;
  }
}
export async function resumeWaitingShares(): Promise<void> {
  await nativeShareIntentModule?.resumeWaitingShares?.();
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
