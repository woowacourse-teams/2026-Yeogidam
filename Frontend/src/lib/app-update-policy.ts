import { Platform } from 'react-native';
import Config from 'react-native-config';

import { createApiClient } from './api/client';
import type { ApiClientOptions, ApiRequest } from './api/client';

const REQUEST_TIMEOUT_MS = 5000;

// Beta builds inject the manually entered app version through .env.
const APP_VERSION = Config.APP_VERSION || '1.1.0';

export type AppUpdatePolicy = {
  latestVersion: string;
  minimumSupportedVersion: string;
  storeUrl: string;
  updateRecommended: boolean;
  updateRequired: boolean;
};

// Set by configureDataSources at app start. Without a server address the check
// returns null, the same as when the server is down.
let request: ApiRequest | null = null;

// The recommended prompt can be closed, so it is shown at most once until the
// app process restarts.
let hasPromptedRecommendedUpdate = false;

function isAppUpdatePolicy(value: unknown): value is AppUpdatePolicy {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const policy = value as Partial<AppUpdatePolicy>;

  return (
    typeof policy.updateRequired === 'boolean' &&
    typeof policy.updateRecommended === 'boolean' &&
    typeof policy.minimumSupportedVersion === 'string' &&
    policy.minimumSupportedVersion.trim().length > 0 &&
    typeof policy.latestVersion === 'string' &&
    policy.latestVersion.trim().length > 0 &&
    typeof policy.storeUrl === 'string' &&
    policy.storeUrl.trim().length > 0
  );
}

export function configureAppUpdatePolicyApi(options: ApiClientOptions) {
  request = createApiClient(options);
}

/**
 * Returns null when the policy cannot be determined. The caller must allow
 * app entry in that case, so an unavailable update-policy service never
 * blocks the user.
 */
export async function getAppUpdatePolicy(): Promise<AppUpdatePolicy | null> {
  if (!request) {
    return null;
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  // The shared API client has no timeout yet. The splash screen waits for this
  // check, so a stalled request must not hold it.
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('App update policy request timed out.')),
      REQUEST_TIMEOUT_MS,
    );
  });
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  try {
    const payload = await Promise.race([
      request('/api/v1/app-update-policies', {
        query: { platform, appVersion: APP_VERSION },
      }),
      timeout,
    ]);
    return isAppUpdatePolicy(payload) ? payload : null;
  } catch (error) {
    if (__DEV__) {
      console.warn('[AppUpdatePolicy] Unable to check update policy.', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Returns true only for the first recommended policy since the app started,
 * so the prompt does not come back each time the app returns to the
 * foreground.
 */
export function consumeRecommendedUpdatePrompt(
  policy: AppUpdatePolicy,
): boolean {
  if (!policy.updateRecommended || hasPromptedRecommendedUpdate) {
    return false;
  }

  hasPromptedRecommendedUpdate = true;
  return true;
}
