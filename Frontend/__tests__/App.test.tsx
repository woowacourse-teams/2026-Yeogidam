/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import {SplashScreen} from '../src/pages/splash/SplashScreen';

// 실제 SafeAreaProvider는 테스트 렌더러에서 자식을 그리지 않으므로 보이는 화면을 확인하려면 View로 바꿉니다.
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const {View} = require('react-native');
  return {
    SafeAreaProvider: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(View, null, children),
    SafeAreaView: ({children}: {children: React.ReactNode}) =>
      ReactModule.createElement(View, null, children),
    useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
  };
});

test('앱을 켜면 최소 시간이 지나기 전에는 스플래시만 보인다', async () => {
  jest.useFakeTimers();

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    jest.advanceTimersByTime(1600);
    await Promise.resolve();
  });

  expect(renderer!.root.findAllByType(SplashScreen)).toHaveLength(1);

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
    jest.clearAllTimers();
    await Promise.resolve();
  });

  jest.useRealTimers();
});
