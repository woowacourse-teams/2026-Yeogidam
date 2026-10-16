import type {AnalyticsClient} from '../src/analytics/analytics';
import {
  toLoginFailureType,
  trackGuestTransferFinished,
  trackLoginFinished,
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
  test('includes whether the login carried a guest transfer only when known', () => {
    const client = createClient();

    trackLoginFinished(client, {provider: 'kakao', outcome: 'success'});
    trackLoginFinished(client, {
      provider: 'kakao',
      outcome: 'failure',
      failureType: 'app_return_failed',
      hasGuestTransfer: true,
    });

    const calls = (client.capture as jest.Mock).mock.calls;
    expect(calls[0][1]).not.toHaveProperty('has_guest_transfer');
    expect(calls[1][1]).toMatchObject({
      outcome: 'failure',
      failure_type: 'app_return_failed',
      has_guest_transfer: true,
    });
  });
});

describe('guest_transfer_finished', () => {
  test.each(['success', 'failure'] as const)('records the %s outcome', outcome => {
    const client = createClient();

    trackGuestTransferFinished(client, outcome);

    expect(client.capture).toHaveBeenCalledWith(
      'guest_transfer_finished',
      expect.objectContaining({outcome}),
    );
  });
});
