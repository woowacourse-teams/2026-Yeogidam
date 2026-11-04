import {
  trackActionFinished,
  trackButtonPressed,
  trackScreenViewed,
  trackSelectionChanged,
} from '../src/analytics/uiEvents';

describe('ui events', () => {
  const capture = jest.fn();
  const client = {capture};

  beforeEach(() => capture.mockClear());

  test('screen_viewed carries the screen name and common properties', () => {
    trackScreenViewed(client, 'saved');

    expect(capture).toHaveBeenCalledWith(
      'screen_viewed',
      expect.objectContaining({screen_name: 'saved', platform: 'ios'}),
    );
  });

  test('button_pressed carries screen, button and extra properties', () => {
    trackButtonPressed(client, 'my', 'logout', {extra: 1});

    expect(capture).toHaveBeenCalledWith(
      'button_pressed',
      expect.objectContaining({
        screen_name: 'my',
        button_name: 'logout',
        extra: 1,
      }),
    );
  });

  test('selection_changed carries the selection and its value', () => {
    trackSelectionChanged(client, 'map', 'category_filter', '카페');

    expect(capture).toHaveBeenCalledWith(
      'selection_changed',
      expect.objectContaining({
        screen_name: 'map',
        selection_name: 'category_filter',
        value: '카페',
      }),
    );
  });

  test('action_finished carries the outcome', () => {
    trackActionFinished(client, 'logout', 'failure', {failure_type: 'x'});

    expect(capture).toHaveBeenCalledWith(
      'action_finished',
      expect.objectContaining({
        action_name: 'logout',
        outcome: 'failure',
        failure_type: 'x',
      }),
    );
  });

  test('does nothing without a PostHog client', () => {
    expect(() => trackButtonPressed(null, 'my', 'logout')).not.toThrow();
    expect(() => trackScreenViewed(undefined, 'my')).not.toThrow();
  });
});
