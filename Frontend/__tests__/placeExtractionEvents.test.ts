import {buildShareExtractionCapture} from '../src/analytics/placeExtractionEvents';

describe('native share event forwarding', () => {
  it('uses the logged-in user identity while retaining the share ID and dropping unexpected properties', () => {
    const payload = buildShareExtractionCapture({
      uuid: '8fabf1e1-535c-4e1f-9f50-1355be11623a',
      name: 'extraction_request_finished',
      share_id: 'share-123',
      distinct_id: 'tester-user-123',
      occurred_at: Date.UTC(2026, 9, 2, 0, 0, 0),
      properties: {
        platform: 'ios',
        release: '1.1.0',
        environment: 'production',
        installation_id: 'install-123',
        outcome: 'request_failed',
        failure_type: 'timeout',
        response_status: 504,
        content_id: 'content-456',
        reel_id: 'legacy-id',
        instagram_url: 'https://example.invalid/private',
      },
    });

    expect(payload).toEqual({
      uuid: '8fabf1e1-535c-4e1f-9f50-1355be11623a',
      event: 'extraction_request_finished',
      distinct_id: 'tester-user-123',
      timestamp: '2026-10-02T00:00:00.000Z',
      properties: {
        platform: 'ios',
        release: '1.1.0',
        environment: 'production',
        installation_id: 'install-123',
        outcome: 'request_failed',
        failure_type: 'timeout',
        response_status: 504,
        content_id: 'content-456',
        share_id: 'share-123',
      },
    });
  });

  it('labels older queued events without an environment when the app forwards them', () => {
    const payload = buildShareExtractionCapture({
      name: 'reel_share_received',
      share_id: 'share-older',
      occurred_at: Date.UTC(2026, 9, 2),
      properties: {platform: 'android', release: '1.1.0', installation_id: 'install-anonymous'},
    });

    expect(payload.distinct_id).toBe('share-older');
    expect(payload.properties.environment).toBe('development');
    expect(payload.properties).toMatchObject({installation_id: 'install-anonymous'});
    expect(payload.properties.$process_person_profile).toBe(false);
  });
});
