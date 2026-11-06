import {
  normalizeReelCaption,
  normalizeReelTitle,
} from '../src/entities/content/title';

describe('normalizeReelCaption', () => {
  test('첫 따옴표 앞의 군더더기와 끝의 닫는 따옴표를 걷어내고 줄바꿈은 둔다', () => {
    expect(
      normalizeReelCaption(
        'seongsu_cafe on Instagram: "성수 카페 5곳\n1. 카페 온월\n\n#성수카페"',
      ),
    ).toBe('성수 카페 5곳\n1. 카페 온월\n\n#성수카페');
  });

  test('따옴표가 없으면 앞뒤 공백만 정리한다', () => {
    expect(normalizeReelCaption('  주말 데이트 코스  ')).toBe('주말 데이트 코스');
  });

  test('줄 끝 공백과 3줄 이상의 빈 줄을 줄인다', () => {
    expect(normalizeReelCaption('첫 줄  \n\n\n\n둘째 줄')).toBe('첫 줄\n\n둘째 줄');
  });

  test('캡션이 없거나 비어 있으면 빈 문자열이다', () => {
    expect(normalizeReelCaption(null)).toBe('');
    expect(normalizeReelCaption(undefined)).toBe('');
    expect(normalizeReelCaption('   ')).toBe('');
  });

  test('제목(normalizeReelTitle)은 같은 기준에서 첫 줄만 쓴다', () => {
    const source = 'a on Instagram: "성수 카페 5곳\n1. 카페 온월"';
    expect(normalizeReelTitle(source, null)).toBe('성수 카페 5곳');
  });
});
