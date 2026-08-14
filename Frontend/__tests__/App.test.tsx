/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  jest.useFakeTimers();

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    jest.advanceTimersByTime(1600);
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
    jest.clearAllTimers();
    await Promise.resolve();
  });

  jest.useRealTimers();
});
