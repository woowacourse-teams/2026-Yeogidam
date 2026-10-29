import {
  DEFAULT_PIN_COLOR,
  toFolderColorCode,
  toFolderColorHex,
} from '../src/entities/folder/color';

describe('toFolderColorHex', () => {
  test.each([
    ['RED', '#FF8A80'],
    ['ORANGE', '#FFB74D'],
    ['YELLOW', '#F2C94C'],
    ['GREEN', '#81C784'],
    ['TEAL', '#4DB6AC'],
    ['PURPLE', '#BA68C8'],
    ['PINK', '#F06292'],
  ])('%s → %s', (code, hex) => {
    expect(toFolderColorHex(code)).toBe(hex);
  });

  test('falls back to the default pin color for unknown or missing codes', () => {
    expect(toFolderColorHex('BLUE')).toBe(DEFAULT_PIN_COLOR);
    expect(toFolderColorHex('red')).toBe(DEFAULT_PIN_COLOR);
    expect(toFolderColorHex(null)).toBe(DEFAULT_PIN_COLOR);
    expect(toFolderColorHex(undefined)).toBe(DEFAULT_PIN_COLOR);
  });
});

describe('toFolderColorCode', () => {
  test('hex를 서버 색 코드로 되돌린다', () => {
    expect(toFolderColorCode('#F06292')).toBe('PINK');
    expect(toFolderColorCode('#81C784')).toBe('GREEN');
  });

  test('모르는 hex는 첫 번째 코드로 보낸다', () => {
    expect(toFolderColorCode('#8FA2FF')).toBe('RED');
    expect(toFolderColorCode(undefined)).toBe('RED');
  });
});
