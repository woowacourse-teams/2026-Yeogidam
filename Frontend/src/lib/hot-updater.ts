import type { ComponentType } from 'react';
import Config from 'react-native-config';
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
      })
    : null;

export function withHotUpdater<P extends object>(
  Component: ComponentType<P>,
): ComponentType<P> {
  if (!hotUpdater) return Component;

  return hotUpdater.wrap({ updateStrategy: 'fingerprint' })(Component);
}
