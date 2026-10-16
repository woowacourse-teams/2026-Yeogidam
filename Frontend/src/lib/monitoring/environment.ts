import {Platform} from 'react-native';
import Config from 'react-native-config';

/** Sentry 메시지에 적는 실행 환경 이름입니다. development와 production은 한글로, 나머지는 설정값을 그대로 씁니다. */
export function describeEnvironment(): string {
  const rawEnvironment = Config.APP_ENV?.trim() || 'development';
  const normalized = rawEnvironment.toLowerCase();
  if (normalized === 'development') return '개발';
  if (normalized === 'production') return '운영';
  return rawEnvironment;
}

export function describePlatform(): string {
  return Platform.OS === 'ios' ? 'iOS' : 'Android';
}

/** 오류 메시지 둘째 줄에 공통으로 들어가는 환경과 기기 표기입니다. */
export function describeEnvironmentAndDevice(): string {
  return `환경·기기: ${describeEnvironment()} · ${describePlatform()}`;
}
