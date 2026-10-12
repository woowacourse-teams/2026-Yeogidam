import {ForegroundElapsedTimer} from '../src/lib/foreground-elapsed-timer';

describe('ForegroundElapsedTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('counts only active time and fires once after three minutes', () => {
    const onComplete = jest.fn();
    const timer = new ForegroundElapsedTimer(180_000, onComplete);

    timer.start();
    jest.advanceTimersByTime(120_000);
    timer.pause();
    jest.advanceTimersByTime(300_000);
    expect(onComplete).not.toHaveBeenCalled();

    timer.start();
    jest.advanceTimersByTime(59_999);
    expect(onComplete).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);

    timer.start();
    jest.advanceTimersByTime(180_000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not prompt after authentication cancels the timer', () => {
    const onComplete = jest.fn();
    const timer = new ForegroundElapsedTimer(180_000, onComplete);

    timer.start();
    jest.advanceTimersByTime(90_000);
    timer.cancel();
    timer.start();
    jest.advanceTimersByTime(180_000);

    expect(onComplete).not.toHaveBeenCalled();
  });
});
