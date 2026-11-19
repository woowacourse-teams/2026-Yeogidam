type UpdateInfo = { shouldForceUpdate: boolean; updateBundle: jest.Mock };

function loadGate(check: () => Promise<UpdateInfo | null>) {
  const reload = jest.fn(() => Promise.resolve());
  let notifyAppReady: (() => void) | undefined;

  jest.resetModules();
  jest.doMock('react-native-config', () => ({
    HOT_UPDATER_URL: 'https://ota.example.test',
    HOT_UPDATER_CLIENT_KEY: 'test-key',
  }));
  jest.doMock('@sentry/react-native', () => ({ captureException: jest.fn() }));
  jest.doMock('@hot-updater/react-native', () => ({
    insights: jest.fn(),
    HotUpdater: {
      init: jest.fn((options: { onNotifyAppReady: () => void }) => {
        notifyAppReady = options.onNotifyAppReady;
        return { getBundleId: () => 'bundle', checkForUpdate: jest.fn(check), reload };
      }),
    },
  }));

  const { waitForOtaBeforeFirstScreen } = require('../src/lib/hot-updater');
  return {
    waitForOtaBeforeFirstScreen: waitForOtaBeforeFirstScreen as (options?: {
      onForceUpdateStart?: () => void;
    }) => Promise<void>,
    reload,
    notifyAppReady: () => notifyAppReady?.(),
  };
}

function trackSettled(promise: Promise<void>) {
  const state = { settled: false };
  promise.then(() => {
    state.settled = true;
  });
  return state;
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('OTA 스플래시 게이트', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('업데이트가 없으면 바로 스플래시를 놓아 준다', async () => {
    const gate = loadGate(() => Promise.resolve(null));
    await expect(gate.waitForOtaBeforeFirstScreen()).resolves.toBeUndefined();
    expect(gate.reload).not.toHaveBeenCalled();
  });

  it('일반 업데이트는 백그라운드로 받고 리로드하지 않는다', async () => {
    const updateBundle = jest.fn(() => Promise.resolve(true));
    const gate = loadGate(() => Promise.resolve({ shouldForceUpdate: false, updateBundle }));
    await gate.waitForOtaBeforeFirstScreen();
    expect(updateBundle).toHaveBeenCalled();
    expect(gate.reload).not.toHaveBeenCalled();
  });

  it('강제 업데이트는 스플래시를 유지한 채 받고 실행 기록 뒤에 리로드한다', async () => {
    const updateBundle = jest.fn(() => Promise.resolve(true));
    const onForceUpdateStart = jest.fn();
    const gate = loadGate(() => Promise.resolve({ shouldForceUpdate: true, updateBundle }));
    const state = trackSettled(gate.waitForOtaBeforeFirstScreen({ onForceUpdateStart }));

    await flush();
    expect(onForceUpdateStart).toHaveBeenCalled();
    expect(gate.reload).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1500);
    await flush();
    expect(state.settled).toBe(false);

    gate.notifyAppReady();
    await flush();
    expect(gate.reload).toHaveBeenCalledTimes(1);
  });

  it('확인이 늦게 끝나면 앱을 먼저 보여 주고 강제 업데이트여도 리로드하지 않는다', async () => {
    const updateBundle = jest.fn(() => Promise.resolve(true));
    let resolveCheck: (info: UpdateInfo) => void = () => undefined;
    const gate = loadGate(
      () => new Promise<UpdateInfo>(resolve => {
        resolveCheck = resolve;
      }),
    );
    const state = trackSettled(gate.waitForOtaBeforeFirstScreen());

    jest.advanceTimersByTime(1500);
    await flush();
    expect(state.settled).toBe(true);

    resolveCheck({ shouldForceUpdate: true, updateBundle });
    gate.notifyAppReady();
    await flush();
    expect(updateBundle).toHaveBeenCalled();
    expect(gate.reload).not.toHaveBeenCalled();
  });

  it('강제 업데이트 다운로드가 실패하면 앱을 보여 준다', async () => {
    const updateBundle = jest.fn(() => Promise.resolve(false));
    const gate = loadGate(() => Promise.resolve({ shouldForceUpdate: true, updateBundle }));
    await gate.waitForOtaBeforeFirstScreen();
    expect(gate.reload).not.toHaveBeenCalled();
  });
});
