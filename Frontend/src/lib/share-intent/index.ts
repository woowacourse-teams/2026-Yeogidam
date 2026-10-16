import {NativeModules} from 'react-native';
import Config from 'react-native-config';

import {getApiBaseUrl} from '../api/config';

type NativeShareIntentModule = {
  installationId?: string;
  setShareSession?(session: NativeShareSession | null): Promise<void>;
  getShareSession?(): Promise<NativeShareSession | null>;
  resumeWaitingShares?(): Promise<void>;
  setApiConfiguration?(baseUrl: string): Promise<void>;
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

export type NativeShareSession = {accessToken: string; refreshToken: string; expiresAt: number; userId: string};
export type ShareTransferStatus = 'SAVED' | 'WAITING_FOR_AUTH' | 'WAITING_FOR_NETWORK' | 'LOGIN_REQUIRED' | 'LOGIN_HANDOFF' | 'GUEST_LOGIN_PROMPT' | 'GUEST_PREVIEW' | 'QUEUED' | 'REQUESTING' | 'API_SUCCEEDED' | 'API_FAILED';
export type NativeShareResult = {requestId?: string; requestSentAt?: number; url: string; rawSharedText?: string; status: 'PENDING'|'PROCESSING'|'COMPLETED'|'FAILED'; transferStatus?: ShareTransferStatus; authReason?: string; reelId?: string; failureReason?: string; responseStatus?: number; retryable?: boolean; updatedAt: number; receivedAt?: number; queuedAt?: number; apiAcceptedAt?: number; transferFinishedAt?: number; reused?: boolean; saveMode?: 'REVIEW_QUEUE' | 'AUTO_SAVE'};

const nativeShareIntentModule: NativeShareIntentModule | undefined =
  NativeModules.ShareIntentModule as NativeShareIntentModule | undefined;

export function getInstallationId(): string | undefined {
  const value = nativeShareIntentModule?.installationId?.trim();
  return value || undefined;
}

/** 공유 익스텐션이 Spring API를 직접 부를 수 있도록 API 주소와 세션을 네이티브 저장소에 넣습니다. */
export async function syncShareSession(session: NativeShareSession | null) {
  await syncShareAnalyticsConfiguration().catch(() => undefined);
  try {
    await nativeShareIntentModule?.setApiConfiguration?.(getApiBaseUrl());
  } catch {
    // API 주소를 넣지 못해도 세션 동기화는 계속합니다. 익스텐션은 이전 설정이나 빌드 설정을 씁니다.
  }
  await nativeShareIntentModule?.setShareSession?.(session);
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
