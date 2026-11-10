import {
  setLibraryPersonProperties,
  setLoginPersonProperties,
} from '../src/analytics/personProperties';

describe('person properties', () => {
  const setPersonProperties = jest.fn();
  const client = {setPersonProperties};
  const now = new Date('2026-11-09T03:00:00.000Z');

  beforeEach(() => setPersonProperties.mockClear());

  test('login keeps the latest provider and the first one only once', () => {
    setLoginPersonProperties(client, {provider: 'kakao', now});

    expect(setPersonProperties).toHaveBeenCalledWith(
      {last_login_provider: 'kakao', last_login_at: now.toISOString()},
      {first_login_provider: 'kakao', first_login_at: now.toISOString()},
      false,
    );
  });

  test('a new member also records the sign-up provider and time', () => {
    setLoginPersonProperties(client, {provider: 'apple', isNewMember: true, now});

    expect(setPersonProperties.mock.calls[0][1]).toEqual({
      first_login_provider: 'apple',
      first_login_at: now.toISOString(),
      signup_provider: 'apple',
      signup_at: now.toISOString(),
    });
  });

  test('an existing member does not get sign-up properties', () => {
    setLoginPersonProperties(client, {provider: 'google', isNewMember: false, now});

    expect(setPersonProperties.mock.calls[0][1]).not.toHaveProperty('signup_at');
  });

  test('library count is updated and the first saved place is noted once', () => {
    setLibraryPersonProperties(client, {savedPlaceCount: 3, now});

    expect(setPersonProperties).toHaveBeenCalledWith(
      {saved_place_count: 3, has_saved_place: true},
      {first_saved_place_seen_at: now.toISOString()},
      false,
    );
  });

  test('an empty library does not set the first saved place time', () => {
    setLibraryPersonProperties(client, {savedPlaceCount: 0, now});

    expect(setPersonProperties).toHaveBeenCalledWith(
      {saved_place_count: 0, has_saved_place: false},
      undefined,
      false,
    );
  });

  test('does nothing without a client', () => {
    expect(() =>
      setLoginPersonProperties(undefined, {provider: 'kakao', now}),
    ).not.toThrow();
  });
});
