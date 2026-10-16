import {toExperimentVariant, toFeatureEnabled} from '../src/lib/experiments';

const VARIANTS = ['warm', 'direct'] as const;

describe('toExperimentVariant', () => {
  test('플래그 값이 변형 목록에 있으면 그 변형을 돌려준다', () => {
    expect(toExperimentVariant('warm', VARIANTS)).toBe('warm');
    expect(toExperimentVariant('direct', VARIANTS)).toBe('direct');
  });

  test('아직 받지 못했거나 꺼져 있거나 모르는 값이면 control이다', () => {
    expect(toExperimentVariant(undefined, VARIANTS)).toBe('control');
    expect(toExperimentVariant(false, VARIANTS)).toBe('control');
    expect(toExperimentVariant(true, VARIANTS)).toBe('control');
    expect(toExperimentVariant('control', VARIANTS)).toBe('control');
    expect(toExperimentVariant('removed-variant', VARIANTS)).toBe('control');
  });
});

describe('toFeatureEnabled', () => {
  test('값을 아직 받지 못했으면 fallback을 쓴다', () => {
    expect(toFeatureEnabled(undefined, true)).toBe(true);
    expect(toFeatureEnabled(undefined, false)).toBe(false);
  });

  test('불리언 플래그는 그대로, 문자열 변형은 control이 아닐 때만 켜진 것으로 본다', () => {
    expect(toFeatureEnabled(true, false)).toBe(true);
    expect(toFeatureEnabled(false, true)).toBe(false);
    expect(toFeatureEnabled('test', false)).toBe(true);
    expect(toFeatureEnabled('control', true)).toBe(false);
    expect(toFeatureEnabled('', true)).toBe(false);
  });
});
