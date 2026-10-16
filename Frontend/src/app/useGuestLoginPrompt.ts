import {useCallback, useEffect, useState} from 'react';
import {AppState} from 'react-native';

import {ForegroundElapsedTimer} from '../lib/foreground-elapsed-timer';

const GUEST_LOGIN_PROMPT_DELAY_MS = 3 * 60 * 1000;

type Options = {
  /** 비회원이 메인 화면을 방해 없이 보고 있는 상태입니다. 꺼지면 시간을 멈춥니다. */
  isGuestBrowsing: boolean;
  isAuthenticated: boolean | null;
};

/**
 * 비회원이 메인 화면을 포그라운드에서 3분 동안 보면 로그인 유도를 띄웁니다.
 * 유도를 닫으면 다시 띄우지 않고, 회원이 되면 잰 시간을 버립니다.
 */
export function useGuestLoginPrompt({isGuestBrowsing, isAuthenticated}: Options) {
  const [isPromptRequested, setIsPromptRequested] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [timer] = useState(
    () => new ForegroundElapsedTimer(GUEST_LOGIN_PROMPT_DELAY_MS, () => setIsPromptRequested(true)),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setIsAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isGuestBrowsing && isAppActive) {
      timer.start();
    } else {
      timer.pause();
    }
  }, [timer, isAppActive, isGuestBrowsing]);

  useEffect(() => {
    if (isAuthenticated) {
      timer.cancel();
      setIsPromptRequested(false);
    }
  }, [timer, isAuthenticated]);

  useEffect(() => () => timer.cancel(), [timer]);

  const dismissGuestLoginPrompt = useCallback(() => setIsPromptRequested(false), []);

  return {
    isGuestLoginPromptVisible: isPromptRequested && isGuestBrowsing && isAppActive,
    dismissGuestLoginPrompt,
  };
}
