import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import {getAnalyticsEnvironment} from './analytics';

/** 앱이 어디서 설치됐는지. 스토어 설치만 실제 사용자로 본다. */
export type InstallSource =
  | 'app_store'
  | 'testflight'
  | 'play_store'
  | 'other_store'
  | 'sideload'
  | 'emulator';

/** 모든 PostHog 이벤트에 붙여 테스트 트래픽을 걸러낼 수 있게 하는 속성입니다. */
export type TrafficProperties = {
  install_source: InstallSource;
  is_emulator: boolean;
  /** 개발 빌드, 비운영 환경, 에뮬레이터, 스토어 밖 설치면 true. 분석에서 제외 대상입니다. */
  is_test_traffic: boolean;
};

const PLAY_STORE_INSTALLER = 'com.android.vending';

export function classifyInstallSource(input: {
  platform: 'ios' | 'android';
  installer: string;
  isEmulator: boolean;
}): InstallSource {
  if (input.isEmulator) return 'emulator';

  if (input.platform === 'ios') {
    if (input.installer === 'AppStore') return 'app_store';
    if (input.installer === 'TestFlight') return 'testflight';
    return 'sideload';
  }

  if (input.installer === PLAY_STORE_INSTALLER) return 'play_store';
  // adb·사전 출시 테스트 기기처럼 설치 앱이 없으면 'unknown'이 온다.
  if (!input.installer || input.installer === 'unknown') return 'sideload';
  return 'other_store';
}

export function buildTrafficProperties(input: {
  platform: 'ios' | 'android';
  installer: string;
  isEmulator: boolean;
  environment: string;
  isDevBuild: boolean;
}): TrafficProperties {
  const installSource = classifyInstallSource(input);
  const fromStore = installSource === 'app_store' || installSource === 'play_store';

  return {
    install_source: installSource,
    is_emulator: input.isEmulator,
    is_test_traffic:
      input.isDevBuild || input.environment !== 'production' || !fromStore,
  };
}

let cached: TrafficProperties | null = null;

/** 앱 실행 중에는 바뀌지 않으므로 한 번만 계산합니다. */
export function getTrafficProperties(): TrafficProperties {
  if (cached) return cached;

  let installer = 'unknown';
  let isEmulator = false;
  try {
    installer = DeviceInfo.getInstallerPackageNameSync();
    isEmulator = DeviceInfo.isEmulatorSync();
  } catch {
    // 네이티브 모듈을 못 읽으면 스토어 설치로 확인할 수 없으므로 테스트 트래픽으로 둔다.
  }

  cached = buildTrafficProperties({
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    installer,
    isEmulator,
    environment: getAnalyticsEnvironment(),
    isDevBuild: __DEV__,
  });
  return cached;
}
