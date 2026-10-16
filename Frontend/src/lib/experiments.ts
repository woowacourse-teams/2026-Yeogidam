import {useFeatureFlag} from 'posthog-react-native';

/**
 * PostHog 플래그를 실험 변형 이름으로 바꿉니다.
 * 다변량 플래그는 변형 이름 문자열을, 켜짐 플래그는 true를 돌려주고, 없거나 꺼져 있으면 undefined나 false입니다.
 * 변형 목록에 없는 값과 아직 받지 못한 값은 모두 control로 봅니다. 그래야 플래그를 끄거나 지우는 것만으로 실험을 거둘 수 있습니다.
 */
export function toExperimentVariant<T extends string>(
  value: unknown,
  variants: readonly T[],
): T | 'control' {
  return typeof value === 'string' && (variants as readonly string[]).includes(value)
    ? (value as T)
    : 'control';
}

/** 켜짐/꺼짐 플래그 값을 읽습니다. 아직 받지 못했으면(undefined) fallback을 씁니다. */
export function toFeatureEnabled(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' && value !== '' && value !== 'control';
}

/**
 * 화면에서 실험 변형을 읽습니다. 변형 코드는 한 번들에 같이 넣고 노출만 이 값으로 가릅니다.
 * 예: const variant = useExperimentVariant('saved-places-empty-copy', ['warm', 'direct'] as const);
 */
export function useExperimentVariant<T extends string>(
  flagKey: string,
  variants: readonly T[],
): T | 'control' {
  return toExperimentVariant(useFeatureFlag(flagKey), variants);
}

/**
 * 켜고 끄는 기능 스위치(킬 스위치 포함)입니다. 플래그를 아직 못 받았을 때 보여 줄 기본값을 fallback으로 넘깁니다.
 * 예: const showNewSheet = useFeatureEnabled('map-sheet-v2', false);
 */
export function useFeatureEnabled(flagKey: string, fallback = false): boolean {
  return toFeatureEnabled(useFeatureFlag(flagKey), fallback);
}
