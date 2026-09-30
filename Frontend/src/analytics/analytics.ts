import {Platform} from 'react-native';
import {getVersion} from 'react-native-device-info';
import type {PostHog} from 'posthog-react-native';

export type AnalyticsClient = Pick<PostHog, 'capture'>;
type AnalyticsProperties = NonNullable<Parameters<PostHog['capture']>[1]>;

export type CommonAnalyticsProperties = {
  platform: 'android' | 'ios';
  release: string;
};

function getCommonProperties(): CommonAnalyticsProperties {
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    release: getVersion(),
  };
}

/** PostHog가 설정되지 않은 개발·테스트 환경에서는 이벤트를 조용히 건너뜁니다. */
export function capture(
  client: AnalyticsClient | null | undefined,
  eventName: string,
  properties: AnalyticsProperties = {},
) {
  client?.capture(eventName, {
    ...properties,
    ...getCommonProperties(),
  });
}
