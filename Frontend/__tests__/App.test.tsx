/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';
import {SplashScreen} from '../src/pages/splash/SplashScreen';
import {renderTracked} from './support/renderers';

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

beforeEach(() => {
  jest.useFakeTimers();
});

// 단언이 중간에 실패해도 가짜 타이머가 다음 테스트로 넘어가지 않게 여기서 되돌립니다. 그린 App은 setupFilesAfterEnv가 먼저 내립니다.
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('앱을 켜면 최소 시간이 지나기 전에는 스플래시만 보인다', async () => {
  const renderer = await renderTracked(<App />);

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(1600);
    await Promise.resolve();
  });

  expect(renderer.root.findAllByType(SplashScreen)).toHaveLength(1);
});
