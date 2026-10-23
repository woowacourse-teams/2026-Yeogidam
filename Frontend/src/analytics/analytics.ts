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
  /** 로그인 상태가 확정된 뒤에만 포함합니다. 비회원 체험 이벤트를 걸러낼 때 사용합니다. */
  is_guest?: boolean;
};

let analyticsIsGuest: boolean | null = null;

/** 인증 상태가 바뀔 때 호출합니다. 확인 전(null)에는 `is_guest`를 보내지 않습니다. */
export function setAnalyticsGuestMode(isGuest: boolean | null) {
  analyticsIsGuest = isGuest;
}

/** 모든 이벤트에 공통으로 포함할 속성입니다. */
export function getAnalyticsEnvironment() {
  return Config.APP_ENV?.trim() || 'development';
}

export function getCommonAnalyticsProperties(): CommonAnalyticsProperties {
  return {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    release: DeviceInfo.getVersion(),
    environment: getAnalyticsEnvironment(),
    ...(analyticsIsGuest === null ? {} : {is_guest: analyticsIsGuest}),
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
