import type {AnalyticsClient} from '../src/analytics/analytics';
import {
  toExtractionFailureType,
  trackExtractionRequestFinished,
  trackExtractionRequestStarted,
} from '../src/analytics/placeExtractionEvents';

function createClient() {
  return {capture: jest.fn()} as unknown as AnalyticsClient;
}

describe('app-initiated extraction events', () => {
  test('marks the request source and links start and finish by request_id', () => {
    const client = createClient();

    trackExtractionRequestStarted(client, {
      requestId: 'req-1',
      source: 'history_retry',
    });
    trackExtractionRequestFinished(client, {
      requestId: 'req-1',
      source: 'history_retry',
      outcome: 'response_received',
      contentId: 'content-1',
    });

    expect(client.capture).toHaveBeenNthCalledWith(
      1,
      'extraction_request_started',
      expect.objectContaining({request_id: 'req-1', source: 'history_retry'}),
    );
    expect(client.capture).toHaveBeenNthCalledWith(
      2,
      'extraction_request_finished',
      expect.objectContaining({
        request_id: 'req-1',
        source: 'history_retry',
        outcome: 'response_received',
        content_id: 'content-1',
      }),
    );
  });

  test('records the failure type and HTTP status only for failed requests', () => {
    const client = createClient();

    trackExtractionRequestFinished(client, {
      requestId: 'req-2',
      source: 'history_retry',
      outcome: 'request_failed',
      failureType: 'timeout',
      responseStatus: 504,
    });

    const [, properties] = (client.capture as jest.Mock).mock.calls[0];
    expect(properties).toMatchObject({
      outcome: 'request_failed',
      failure_type: 'timeout',
      response_status: 504,
    });
    expect(properties).not.toHaveProperty('content_id');
    expect(properties).not.toHaveProperty('share_id');
  });

  test.each([
    [{errorCode: 'AUTH401_002'}, 'auth_failed'],
    [{errorCode: 'CLIENT000_002'}, 'timeout'],
    [{errorCode: 'CLIENT000_001'}, 'network_error'],
    [{errorCode: 'DATA500_001'}, 'server_error'],
    [{errorCode: 'REEL400_001'}, 'invalid_request'],
    [{errorCode: null, status: 503}, 'server_error'],
    [{errorCode: null, status: 422}, 'invalid_request'],
    [{errorCode: null}, 'network_error'],
  ] as const)('classifies %j as %s', (error, expected) => {
    expect(toExtractionFailureType(error)).toBe(expected);
  });
});
