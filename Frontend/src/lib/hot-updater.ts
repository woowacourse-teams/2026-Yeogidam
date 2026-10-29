import type { ComponentType } from 'react';
import Config from 'react-native-config';
import * as Sentry from '@sentry/react-native';
import { HotUpdater, insights } from '@hot-updater/react-native';

function configuredValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : null;
}

const baseURL = configuredValue(Config.HOT_UPDATER_URL);
const clientKey = configuredValue(Config.HOT_UPDATER_CLIENT_KEY);

/** 업데이트 서버 설정이 없으면 OTA 없이 앱에 포함된 번들로 실행합니다. */
export const hotUpdater =
  baseURL && clientKey
    ? HotUpdater.init({
        baseURL,
        requestHeaders: { 'x-api-key': clientKey },
        plugins: [insights()],
        onError: error => {
          Sentry.captureException(error, { tags: { source: 'hot-updater' } });
        },
      })
    : null;

/**
 * 이번 실행에서 사용 중인 OTA 배포 ID로, `hot-updater bundle list`와 console의 ID와 같습니다.
 * 내려받은 업데이트는 다음 실행부터 적용되므로 앱 시작 시점의 값을 고정해 사용합니다.
 */
export const otaBundleId = hotUpdater?.getBundleId() ?? null;

export function withHotUpdater<P extends object>(
  Component: ComponentType<P>,
): ComponentType<P> {
  if (!hotUpdater) return Component;

  return hotUpdater.wrap({ updateStrategy: 'fingerprint' })(Component);
}
