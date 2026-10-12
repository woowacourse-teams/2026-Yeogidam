import { parseServerDateTime, toIdString } from '../src/lib/api/values';

describe('server time parsing', () => {
  it.each([
    ['2026-10-11T01:02:03Z', '2026-10-11T01:02:03.000Z'],
    ['2026-10-11T01:02:03.123Z', '2026-10-11T01:02:03.123Z'],
    ['2026-10-11T23:59:59.999999Z', '2026-10-11T23:59:59.999Z'],
  ])('parses the UTC time %s into milliseconds', (value, expected) => {
    expect(parseServerDateTime(value).toISOString()).toBe(expected);
  });

  it('returns an invalid date for a time without the Z suffix', () => {
    expect(
      Number.isNaN(parseServerDateTime('2026-10-11T01:02:03.123456').getTime()),
    ).toBe(true);
  });
});

describe('server id conversion', () => {
  it('stringifies numeric ids without changing the digits', () => {
    expect(toIdString(15)).toBe('15');
    expect(toIdString(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991');
  });
});
