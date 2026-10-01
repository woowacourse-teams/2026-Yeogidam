import {Platform} from 'react-native';
import Config from 'react-native-config';
import DeviceInfo from 'react-native-device-info';

/** 모든 분석 이벤트에서 사용하는 JSON 속성 타입입니다. */
export type AnalyticsValue =
  | string
  | number
  | boolean
  | null
  | AnalyticsValue[]
  | {[key: string]: AnalyticsValue};

export type AnalyticsProperties = Record<string, AnalyticsValue>;

/** 이벤트 전송에 필요한 PostHog 최소 인터페이스입니다. */
export type AnalyticsClient = {
  capture: (eventName: string, properties?: AnalyticsProperties) => void;
};

export type CommonAnalyticsProperties = {
  platform: 'android' | 'ios';
  release: string;
  environment: string;
};

/** 모든 이벤트에 공통으로 포함할 속성입니다. */
export function getCommonAnalyticsProperties(): CommonAnalyticsProperties {
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    release: DeviceInfo.getVersion(),
    environment: Config.APP_ENV?.trim() || 'development',
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
    ...getCommonAnalyticsProperties(),
  });
}
