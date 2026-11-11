/** 장소를 찾은 지도 제공자입니다. 서버 `mapProvider` 값과 같습니다. */
export type MapProvider = 'KAKAO' | 'GOOGLE';

/**
 * 서버 `mapProvider` 문자열을 앱 값으로 바꿉니다.
 * 필드가 없던 서버(pipeline-version 1 이전)와 모르는 값은 기존처럼 카카오로 봅니다.
 */
export function toMapProvider(value: string | null | undefined): MapProvider {
  return value === 'GOOGLE' ? 'GOOGLE' : 'KAKAO';
}
