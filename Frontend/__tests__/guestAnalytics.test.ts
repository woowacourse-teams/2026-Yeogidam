import type {AnalyticsClient} from '../src/analytics/analytics';
import {
  getCommonAnalyticsProperties,
  setAnalyticsGuestMode,
} from '../src/analytics/analytics';
import {
  trackHistoryContentDetailViewed,
  trackHistoryContentViewed,
} from '../src/analytics/placeExtractionEvents';
import {
  capturePlaceMapViewed,
  captureSavedPlaceOpened,
  captureSavedPlaceSelected,
} from '../src/analytics/savedPlaceEvents';
import {
  ONBOARDING_HISTORY_REEL,
  ONBOARDING_PLACES,
} from '../src/entities/onboarding/data';

function createClient() {
  return {capture: jest.fn()} as unknown as AnalyticsClient;
}

afterEach(() => setAnalyticsGuestMode(null));

describe('is_guest common property', () => {
  test('is omitted until the auth state is known', () => {
    expect(getCommonAnalyticsProperties()).not.toHaveProperty('is_guest');
  });

  test.each([true, false])('follows the auth state (%s)', isGuest => {
    setAnalyticsGuestMode(isGuest);
    expect(getCommonAnalyticsProperties().is_guest).toBe(isGuest);
  });

  test('is attached to captured events', () => {
    setAnalyticsGuestMode(true);
    const client = createClient();

    trackHistoryContentViewed(client, 'real-content', 'success');

    expect(client.capture).toHaveBeenCalledWith(
      'history_content_viewed',
      expect.objectContaining({content_id: 'real-content', is_guest: true}),
    );
  });
});

describe('onboarding sample content exclusion', () => {
  test('does not capture history events for the sample reel', () => {
    const client = createClient();

    trackHistoryContentViewed(client, ONBOARDING_HISTORY_REEL.id, 'success');
    trackHistoryContentDetailViewed(client, ONBOARDING_HISTORY_REEL.id, 'success');

    expect(client.capture).not.toHaveBeenCalled();
  });

  test('does not capture saved place events for sample places', () => {
    const client = createClient();
    const sample = {
      placeId: ONBOARDING_PLACES[0].id,
      savedPlaceId: 'saved-1',
      placeViewId: 'view-1',
      source: 'saved_places_grid' as const,
      savedAt: '2026-10-12T00:00:00.000Z',
    };

    captureSavedPlaceSelected(client, sample);
    captureSavedPlaceOpened(client, sample);
    capturePlaceMapViewed(client, sample);

    expect(client.capture).not.toHaveBeenCalled();
  });
});
