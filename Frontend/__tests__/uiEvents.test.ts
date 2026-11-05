import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';

import {
  trackActionFinished,
  trackButtonPressed,
  trackScreenViewed,
  trackSelectionChanged,
  useScreenAnalytics,
} from '../src/analytics/uiEvents';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));

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

  // 화면들이 반환값을 useCallback, useEffect 의존성으로 쓰기 때문에
  // 반환값이 렌더마다 바뀌면 의존하는 effect도 렌더마다 다시 실행됩니다.
  test('useScreenAnalytics keeps the same object across re-renders', async () => {
    const results: ReturnType<typeof useScreenAnalytics>[] = [];
    function Screen() {
      results.push(useScreenAnalytics('map'));
      return null;
    }

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Screen));
    });
    await act(async () => {
      renderer.update(React.createElement(Screen));
    });

    expect(results).toHaveLength(2);
    expect(results[1]).toBe(results[0]);
  });
});
