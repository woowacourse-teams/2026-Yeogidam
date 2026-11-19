import {
  buildTrafficProperties,
  classifyInstallSource,
} from '../src/analytics/traffic';

const store = {environment: 'production', isDevBuild: false, isEmulator: false};

describe('install source', () => {
  test.each([
    ['ios', 'AppStore', false, 'app_store'],
    ['ios', 'TestFlight', false, 'testflight'],
    ['ios', 'Other', false, 'sideload'],
    ['android', 'com.android.vending', false, 'play_store'],
    ['android', 'unknown', false, 'sideload'],
    ['android', 'com.sec.android.app.samsungapps', false, 'other_store'],
    ['ios', 'AppStore', true, 'emulator'],
    ['android', 'com.android.vending', true, 'emulator'],
  ] as const)('%s installer %s (emulator %s) is %s', (platform, installer, isEmulator, expected) => {
    expect(classifyInstallSource({platform, installer, isEmulator})).toBe(expected);
  });
});

describe('test traffic', () => {
  test('a production App Store install is real traffic', () => {
    expect(buildTrafficProperties({...store, platform: 'ios', installer: 'AppStore'})).toEqual({
      install_source: 'app_store',
      is_emulator: false,
      is_test_traffic: false,
    });
  });

  test('a production Play Store install is real traffic', () => {
    expect(
      buildTrafficProperties({...store, platform: 'android', installer: 'com.android.vending'})
        .is_test_traffic,
    ).toBe(false);
  });

  test.each([
    ['TestFlight build', {platform: 'ios', installer: 'TestFlight'}],
    ['sideloaded Android build', {platform: 'android', installer: 'unknown'}],
    ['emulator', {platform: 'android', installer: 'com.android.vending', isEmulator: true}],
    ['development environment', {platform: 'ios', installer: 'AppStore', environment: 'development'}],
    ['debug build', {platform: 'ios', installer: 'AppStore', isDevBuild: true}],
  ] as const)('%s is test traffic', (_name, overrides) => {
    expect(buildTrafficProperties({...store, ...overrides}).is_test_traffic).toBe(true);
  });
});
