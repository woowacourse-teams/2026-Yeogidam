import {
  DEFAULT_PIN_COLOR,
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
