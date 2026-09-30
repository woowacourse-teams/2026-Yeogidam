import type {AnalyticsClient} from '../src/analytics/analytics';
import {
  capturePlaceMapViewed,
  captureSavedPlaceOpened,
  captureSavedPlaceSelected,
  captureSavedPlacesSearchSubmitted,
  captureSavedPlacesViewed,
  getSavedPlaceRevisit,
} from '../src/analytics/savedPlaceEvents';

function createClient() {
  return {
    capture: jest.fn(),
  } as unknown as AnalyticsClient;
}

const viewContext = {
  placeId: 'place-1',
  savedPlaceId: 'saved-place-1',
  placeViewId: 'view-1',
  source: 'saved_places_search' as const,
  savedAt: '2026-09-28T00:00:00.000Z',
};

describe('saved place analytics', () => {
  test('captures the saved places funnel without sensitive place data', () => {
    const client = createClient();

    captureSavedPlacesViewed(client, {
      placeCount: 2,
      entryType: 'direct',
    });
    captureSavedPlacesSearchSubmitted(client, {
      searchId: 'search-1',
      searchMethod: 'keyboard',
      resultCount: 1,
    });
    captureSavedPlaceSelected(client, {
      ...viewContext,
      searchId: 'search-1',
      position: 1,
    });
    captureSavedPlaceOpened(client, {
      ...viewContext,
      viewedAt: new Date('2026-09-30T00:00:00.000Z'),
    });
    capturePlaceMapViewed(client, {
      ...viewContext,
      viewedAt: new Date('2026-09-30T00:00:00.000Z'),
    });

    expect(client.capture).toHaveBeenNthCalledWith(
      1,
      'saved_places_viewed',
      expect.objectContaining({
        place_count: 2,
        has_places: true,
        entry_type: 'direct',
        release: '1.2.3',
      }),
    );
    expect(client.capture).toHaveBeenNthCalledWith(
      2,
      'saved_places_search_submitted',
      expect.objectContaining({
        search_id: 'search-1',
        search_method: 'keyboard',
        result_count: 1,
        has_result: true,
      }),
    );
    expect(client.capture).toHaveBeenNthCalledWith(
      3,
      'saved_place_selected',
      expect.objectContaining({
        place_id: 'place-1',
        saved_place_id: 'saved-place-1',
        place_view_id: 'view-1',
        source: 'saved_places_search',
        search_id: 'search-1',
        position: 1,
      }),
    );
    expect(client.capture).toHaveBeenNthCalledWith(
      4,
      'saved_place_opened',
      expect.objectContaining({
        is_revisit: true,
        days_since_saved_bucket: '2_7_days',
      }),
    );
    expect(client.capture).toHaveBeenNthCalledWith(
      5,
      'place_map_viewed',
      expect.objectContaining({
        map_provider: 'kakao',
        is_revisit: true,
      }),
    );

    for (const [, properties] of (client.capture as jest.Mock).mock.calls) {
      expect(properties).not.toHaveProperty('query');
      expect(properties).not.toHaveProperty('place_name');
      expect(properties).not.toHaveProperty('address');
      expect(properties).not.toHaveProperty('latitude');
      expect(properties).not.toHaveProperty('longitude');
    }
  });

  test.each([
    ['2026-09-29T00:00:00.001Z', false, 'same_day'],
    ['2026-09-29T00:00:00.000Z', true, '1_day'],
    ['2026-09-28T00:00:00.000Z', true, '2_7_days'],
    ['2026-09-22T00:00:00.000Z', true, '8_30_days'],
    ['2026-08-30T00:00:00.000Z', true, '31_plus_days'],
  ])(
    'buckets saved date %s using the 24-hour revisit rule',
    (savedAt, isRevisit, daysSinceSavedBucket) => {
      expect(
        getSavedPlaceRevisit(
          savedAt,
          new Date('2026-09-30T00:00:00.000Z'),
        ),
      ).toEqual({isRevisit, daysSinceSavedBucket});
    },
  );
});
