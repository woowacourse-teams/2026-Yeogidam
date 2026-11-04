import {flushShareAnalytics} from '../src/lib/share-intent/posthog-share';
import {
  acknowledgeShareAnalyticsEvent,
  getPendingShareAnalyticsEvents,
} from '../src/lib/share-intent';

jest.mock('react-native-config', () => ({
  POSTHOG_PROJECT_TOKEN: 'phc_test',
  POSTHOG_HOST: 'https://posthog.example.com',
}));

jest.mock('../src/lib/share-intent', () => ({
  getPendingShareAnalyticsEvents: jest.fn(),
  acknowledgeShareAnalyticsEvent: jest.fn(),
}));

describe('flushShareAnalytics', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({ok: true});
  });

  it('forwards the outcome the share screen showed before acknowledging it', async () => {
    (getPendingShareAnalyticsEvents as jest.Mock).mockResolvedValue([
      {
        id: 'reel_share_outcome_viewed.share-1',
        uuid: 'uuid-1',
        name: 'reel_share_outcome_viewed',
        share_id: 'share-1',
        occurred_at: Date.UTC(2026, 10, 4),
        properties: {platform: 'ios', outcome: 'accepted'},
      },
    ]);

    await flushShareAnalytics();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.event).toBe('reel_share_outcome_viewed');
    expect(body.properties).toMatchObject({outcome: 'accepted', share_id: 'share-1'});
    expect(acknowledgeShareAnalyticsEvent).toHaveBeenCalledWith('reel_share_outcome_viewed.share-1');
  });

  it('keeps the event queued when PostHog rejects it', async () => {
    (getPendingShareAnalyticsEvents as jest.Mock).mockResolvedValue([
      {
        id: 'reel_share_outcome_viewed.share-2',
        name: 'reel_share_outcome_viewed',
        share_id: 'share-2',
        occurred_at: Date.UTC(2026, 10, 4),
        properties: {outcome: 'failed', reason: 'invalid_link'},
      },
    ]);
    fetchMock.mockResolvedValue({ok: false});

    await flushShareAnalytics();

    expect(acknowledgeShareAnalyticsEvent).not.toHaveBeenCalled();
  });
});
