import * as Sentry from '@sentry/react-native';

import {
  markStartupFullDisplay,
  markStartupInitialDisplay,
  resetStartupTraceForTest,
  startStartupPhase,
  startStartupTrace,
} from '../src/lib/performance/startupTrace';

type FakeSpan = {end: jest.Mock; setAttribute: jest.Mock};

const startInactiveSpan = Sentry.startInactiveSpan as unknown as jest.Mock;
const setMeasurement = Sentry.setMeasurement as unknown as jest.Mock;

function spanAt(index: number): FakeSpan {
  return startInactiveSpan.mock.results[index].value as FakeSpan;
}

function measurementNames() {
  return setMeasurement.mock.calls.map(call => call[0]);
}

describe('startupTrace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStartupTraceForTest();
  });

  it('저장 장소로 시작하면 TTID와 TTFD를 모두 기록하고 트랜잭션을 닫는다', () => {
    startStartupTrace();
    const root = spanAt(0);

    expect(Sentry.extendAppStart).toHaveBeenCalledTimes(1);

    markStartupInitialDisplay('saved_places');
    expect(Sentry.finishExtendedAppStart).toHaveBeenCalledTimes(1);
    expect(root.end).not.toHaveBeenCalled();

    markStartupFullDisplay(true);

    expect(measurementNames()).toEqual([
      'time_to_initial_display',
      'time_to_full_display',
    ]);
    expect(root.setAttribute).toHaveBeenCalledWith('startup.destination', 'saved_places');
    expect(root.setAttribute).toHaveBeenCalledWith('startup.outcome', 'full_display');
    expect(root.end).toHaveBeenCalledTimes(1);
  });

  it('온보딩으로 시작하면 TTID만 기록하고 바로 닫는다', () => {
    startStartupTrace();
    const root = spanAt(0);

    markStartupInitialDisplay('onboarding');
    markStartupFullDisplay(true);

    expect(measurementNames()).toEqual(['time_to_initial_display']);
    expect(root.setAttribute).toHaveBeenCalledWith('startup.outcome', 'initial_display_only');
    expect(root.end).toHaveBeenCalledTimes(1);
  });

  it('스플래시 대기 작업을 App Start의 하위 span으로 남긴다', () => {
    startStartupTrace();
    const endPhase = startStartupPhase('update_policy');

    expect(startInactiveSpan).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parentSpan: Sentry.getExtendedAppStartSpan(),
        name: 'update_policy',
      }),
    );
    endPhase();
    expect(spanAt(1).end).toHaveBeenCalledTimes(1);
  });

  it('첫 화면 이전의 TTFD나 두 번째 TTID는 무시한다', () => {
    startStartupTrace();
    markStartupFullDisplay(true);
    markStartupInitialDisplay('saved_places');
    markStartupInitialDisplay('onboarding');

    expect(measurementNames()).toEqual(['time_to_initial_display']);
    expect(Sentry.finishExtendedAppStart).toHaveBeenCalledTimes(1);
  });

  it('TTFD가 오지 않으면 30초 뒤 timeout으로 닫는다', () => {
    jest.useFakeTimers();
    startStartupTrace();
    const root = spanAt(0);
    markStartupInitialDisplay('saved_places');

    jest.advanceTimersByTime(30_000);

    expect(root.setAttribute).toHaveBeenCalledWith('startup.outcome', 'timeout');
    expect(root.end).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
