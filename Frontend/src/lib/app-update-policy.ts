import { Platform } from 'react-native';

import { SUPABASE_URL } from './auth/supabase';

const REQUEST_TIMEOUT_MS = 5000;

// Keep this value aligned with MARKETING_VERSION (iOS) and versionName (Android).
// Both native targets are currently released as 1.1.0.
const APP_VERSION = '1.1.0';

export type AppUpdatePolicy = {
  minimumSupportedVersion: string;
  storeUrl: string;
  updateRequired: boolean;
};

function isAppUpdatePolicy(value: unknown): value is AppUpdatePolicy {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const policy = value as Partial<AppUpdatePolicy>;

  return (
    typeof policy.updateRequired === 'boolean' &&
    typeof policy.minimumSupportedVersion === 'string' &&
    policy.minimumSupportedVersion.trim().length > 0 &&
    typeof policy.storeUrl === 'string' &&
    policy.storeUrl.trim().length > 0
  );
}

/**
 * Returns null when the policy cannot be determined. The caller must allow
 * app entry in that case, so an unavailable update-policy service never
 * blocks the user.
 */
export async function getAppUpdatePolicy(): Promise<AppUpdatePolicy | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const query = new URLSearchParams({
    platform,
    appVersion: APP_VERSION,
  });

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/app-update-policy?${query.toString()}`,
      {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-store',
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload: unknown = await response.json();
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
