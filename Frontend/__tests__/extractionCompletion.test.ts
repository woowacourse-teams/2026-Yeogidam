import {reportExtractionResults} from '../src/analytics/extractionCompletion';
import type {HistoryReel} from '../src/entities/content/types';

const NOW = Date.parse('2026-11-09T12:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60000).toISOString();

function reel(
  id: string,
  status: HistoryReel['processing_status'],
  createdAt: string,
  failureReason: string | null = null,
): HistoryReel {
  return {
    id,
    instagram_url: null,
    instagram_title: null,
    instagram_description: null,
    instagram_author_username: null,
    instagram_thumbnail_url: null,
    processing_status: status,
    failure_reason: failureReason,
    save_mode: null,
    created_at: createdAt,
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = {...initial};
  return {
    data,
    getItem: jest.fn(async (key: string) => (key in data ? data[key] : null)),
    setItem: jest.fn(async (key: string, value: string) => {
      data[key] = value;
    }),
  };
}

describe('reportExtractionResults', () => {
  const capture = jest.fn();
  const client = {capture};
  const getPlaceCount = jest.fn(async (id: string) => (id === 'empty' ? 0 : 3));

  beforeEach(() => {
    capture.mockClear();
    getPlaceCount.mockClear();
  });

  const deps = (storage: ReturnType<typeof memoryStorage>, memberId: string | null = '1018') => ({
    client,
    memberId,
    getPlaceCount,
    storage,
    now: () => NOW,
  });

  const sent = () =>
    capture.mock.calls.map(([name, properties]) => ({
      name,
      content_id: properties.content_id,
      result: properties.result,
      place_count: properties.place_count,
      has_places: properties.has_places,
      minutes_since_share: properties.minutes_since_share,
      failure_type: properties.failure_type,
    }));

  test('reports finished shares once with the result and place count', async () => {
    const storage = memoryStorage({'analytics.extraction_results_reported.v1:1018': '[]'});
    const reels = [
      reel('a', 'COMPLETED', minutesAgo(5)),
      reel('empty', 'COMPLETED', minutesAgo(10)),
      reel('b', 'FAILED', minutesAgo(3), 'MEDIA400_002 | 지원하지 않는 링크 | HTTP_400'),
      reel('c', 'PROCESSING', minutesAgo(1)),
    ];

    await reportExtractionResults(reels, deps(storage));
    await reportExtractionResults(reels, deps(storage));

    expect(sent()).toEqual([
      {name: 'extraction_completed', content_id: 'a', result: 'success', place_count: 3, has_places: true, minutes_since_share: 5, failure_type: undefined},
      {name: 'extraction_completed', content_id: 'empty', result: 'success', place_count: 0, has_places: false, minutes_since_share: 10, failure_type: undefined},
      {name: 'extraction_completed', content_id: 'b', result: 'failed', place_count: null, has_places: null, minutes_since_share: 3, failure_type: 'MEDIA400_002'},
    ]);
    expect(getPlaceCount).not.toHaveBeenCalledWith('b');
  });

  test('reports a share when it finishes on a later poll', async () => {
    const storage = memoryStorage({'analytics.extraction_results_reported.v1:1018': '[]'});

    await reportExtractionResults([reel('a', 'PROCESSING', minutesAgo(1))], deps(storage));
    expect(capture).not.toHaveBeenCalled();

    await reportExtractionResults([reel('a', 'COMPLETED', minutesAgo(1))], deps(storage));
    expect(sent().map(event => event.content_id)).toEqual(['a']);
  });

  test('on the first run skips shares older than a day but keeps recent ones', async () => {
    const storage = memoryStorage();

    await reportExtractionResults(
      [reel('recent', 'COMPLETED', minutesAgo(30)), reel('old', 'COMPLETED', minutesAgo(60 * 48))],
      deps(storage),
    );

    expect(sent().map(event => event.content_id)).toEqual(['recent']);
    expect(JSON.parse(storage.data['analytics.extraction_results_reported.v1:1018'])).toEqual(
      expect.arrayContaining(['recent', 'old']),
    );
  });

  test('remembers reported shares separately for each member', async () => {
    const storage = memoryStorage({
      'analytics.extraction_results_reported.v1:1018': '["a"]',
      'analytics.extraction_results_reported.v1:2000': '[]',
    });
    const reels = [reel('a', 'COMPLETED', minutesAgo(5))];

    await reportExtractionResults(reels, deps(storage, '1018'));
    await reportExtractionResults(reels, deps(storage, '2000'));

    expect(sent().map(event => event.content_id)).toEqual(['a']);
  });

  test('does not send a free-form failure reason', async () => {
    const storage = memoryStorage({'analytics.extraction_results_reported.v1:1018': '[]'});

    await reportExtractionResults([reel('x', 'FAILED', minutesAgo(2), '장소를 찾지 못했어요')], deps(storage));

    expect(capture.mock.calls[0][1]).not.toHaveProperty('failure_type');
  });

  test('sends the event without a place count when the count request fails', async () => {
    const storage = memoryStorage({'analytics.extraction_results_reported.v1:1018': '[]'});
    getPlaceCount.mockRejectedValueOnce(new Error('network'));

    await reportExtractionResults([reel('a', 'COMPLETED', minutesAgo(2))], deps(storage));

    expect(sent()[0]).toMatchObject({result: 'success', place_count: null, has_places: null});
  });

  test('does nothing for a guest or without an analytics client', async () => {
    const storage = memoryStorage({'analytics.extraction_results_reported.v1:1018': '[]'});
    const reels = [reel('a', 'COMPLETED', minutesAgo(2))];

    await reportExtractionResults(reels, deps(storage, null));
    await reportExtractionResults(reels, {...deps(storage), client: null});

    expect(capture).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test('does not report twice when two screens pass the same result at once', async () => {
    const storage = memoryStorage({'analytics.extraction_results_reported.v1:1018': '[]'});
    const reels = [reel('a', 'COMPLETED', minutesAgo(2))];

    await Promise.all([
      reportExtractionResults(reels, deps(storage)),
      reportExtractionResults(reels, deps(storage)),
    ]);

    expect(capture).toHaveBeenCalledTimes(1);
  });
});
