import React from 'react';
import {AppState, type AppStateStatus} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {useScreenTimeTracking} from '../src/analytics/useScreenTimeTracking';

describe('useScreenTimeTracking', () => {
  const capture = jest.fn();
  const client = {capture};
  let clock = 0;
  const now = () => clock;
  let emitAppState: (state: AppStateStatus) => void = () => undefined;
  const remove = jest.fn();
  const previousAppState = AppState.currentState;

  function Probe({name, screenKey}: {name: string; screenKey?: string}) {
    useScreenTimeTracking(client, name, screenKey, now);
    return null;
  }

  const events = () =>
    capture.mock.calls.map(([eventName, properties]) => ({
      eventName,
      screen_name: properties.screen_name,
      duration_ms: properties.duration_ms,
      exit_reason: properties.exit_reason,
    }));

  beforeEach(() => {
    capture.mockClear();
    remove.mockClear();
    clock = 0;
    (AppState as {currentState: string}).currentState = 'active';
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, handler) => {
        emitAppState = handler as (state: AppStateStatus) => void;
        return {remove} as ReturnType<typeof AppState.addEventListener>;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (AppState as {currentState: string}).currentState = previousAppState;
  });

  test('records how long the previous screen was shown when the screen changes', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Probe name="saved" />);
    });
    clock = 4200;
    await ReactTestRenderer.act(async () => {
      renderer.update(<Probe name="map" />);
    });

    expect(events()).toEqual([
      {eventName: 'screen_viewed', screen_name: 'saved', duration_ms: undefined, exit_reason: undefined},
      {eventName: 'screen_left', screen_name: 'saved', duration_ms: 4200, exit_reason: 'navigate'},
      {eventName: 'screen_viewed', screen_name: 'map', duration_ms: undefined, exit_reason: undefined},
    ]);
  });

  test('leaves out the time the app spent in the background', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Probe name="saved" />);
    });
    clock = 1000;
    emitAppState('background');
    clock = 60000;
    emitAppState('active');
    clock = 62500;
    await ReactTestRenderer.act(async () => {
      renderer.update(<Probe name="map" />);
    });

    expect(events().filter(event => event.eventName === 'screen_left')).toEqual([
      {eventName: 'screen_left', screen_name: 'saved', duration_ms: 1000, exit_reason: 'background'},
      {eventName: 'screen_left', screen_name: 'saved', duration_ms: 2500, exit_reason: 'navigate'},
    ]);
  });

  test('keeps measuring while iOS is only briefly inactive', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Probe name="saved" />);
    });
    clock = 500;
    emitAppState('inactive');
    clock = 900;
    emitAppState('active');
    clock = 3000;
    await ReactTestRenderer.act(async () => {
      renderer.update(<Probe name="map" />);
    });

    expect(events().filter(event => event.eventName === 'screen_left')).toEqual([
      {eventName: 'screen_left', screen_name: 'saved', duration_ms: 3000, exit_reason: 'navigate'},
    ]);
  });

  test('treats stacked screens with the same name as separate visits', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Probe name="detail" screenKey="detail:a" />);
    });
    clock = 700;
    await ReactTestRenderer.act(async () => {
      renderer.update(<Probe name="detail" screenKey="detail:b" />);
    });

    expect(events().map(event => event.eventName)).toEqual([
      'screen_viewed',
      'screen_left',
      'screen_viewed',
    ]);
    expect(events()[1].duration_ms).toBe(700);
  });

  test('does not record anything new when the screen stays the same', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Probe name="saved" />);
    });
    clock = 300;
    await ReactTestRenderer.act(async () => {
      renderer.update(<Probe name="saved" />);
    });

    expect(events().map(event => event.eventName)).toEqual(['screen_viewed']);
  });
});
