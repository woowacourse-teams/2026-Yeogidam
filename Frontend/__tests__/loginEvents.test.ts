import type {AnalyticsClient} from '../src/analytics/analytics';
import {
  toLoginFailureType,
  trackLoginFinished,
  trackLoginStarted,
} from '../src/analytics/userEntryEvents';

function createClient() {
  return {capture: jest.fn()} as unknown as AnalyticsClient;
}

describe('login failure types', () => {
  test.each([
    ['AUTH000_001', 'user_cancelled'],
    ['CLIENT000_001', 'network_error'],
    ['CLIENT000_002', 'network_error'],
    ['AUTH400_001', 'auth_failed'],
    ['AUTH502_001', 'auth_failed'],
    ['CLIENT000_003', 'app_return_failed'],
    ['SOMETHING_ELSE', 'unknown'],
  ])('maps %s to %s', (errorCode, expected) => {
    expect(toLoginFailureType({errorCode})).toBe(expected);
  });

  test('treats errors without a code as unknown', () => {
    expect(toLoginFailureType(new Error('storage failed') as never)).toBe('unknown');
    expect(toLoginFailureType(null)).toBe('unknown');
  });
});

describe('login_finished', () => {
  test('records provider and outcome, with failure details when relevant', () => {
    const client = createClient();

    trackLoginFinished(client, {provider: 'kakao', outcome: 'success'});
    trackLoginFinished(client, {
      provider: 'kakao',
      outcome: 'failure',
      failureType: 'app_return_failed',
    });

    const calls = (client.capture as jest.Mock).mock.calls;
    expect(calls[1][1]).toMatchObject({
      outcome: 'failure',
      failure_type: 'app_return_failed',
    });
  });

  test('links a login that started from the share screen to its share', () => {
    const client = createClient();
    const entry = {entry: 'share_login_handoff', shareId: 'share-123'} as const;

    trackLoginStarted(client, 'apple', entry);
    trackLoginFinished(client, {provider: 'apple', outcome: 'success', entry});
    trackLoginStarted(client, 'kakao');

    const calls = (client.capture as jest.Mock).mock.calls;
    expect(calls[0][1]).toMatchObject({entry: 'share_login_handoff', share_id: 'share-123'});
    expect(calls[1][1]).toMatchObject({entry: 'share_login_handoff', share_id: 'share-123'});
    expect(calls[2][1]).not.toHaveProperty('entry');
    expect(calls[2][1]).not.toHaveProperty('share_id');
  });
});
