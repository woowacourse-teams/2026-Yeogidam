import {useMemo, useReducer} from 'react';

import type {SavedPlaceViewContext} from '../analytics/savedPlaceEvents';
import type {Place} from '../entities/place/types';
import type {AuthScreen, DetailSource, MainFlowState, MainScreen} from '../types/navigation';
import {
  INITIAL_NAVIGATION_STATE,
  navigationReducer,
  selectCurrentScreen,
} from './navigation';

/**
 * 앱의 화면 흐름(인증 스택, 메인 탭, 상세, 비회원 로그인 복귀)을 리듀서 하나로 관리합니다.
 * 전환 규칙은 navigation.ts의 순수 함수에 있고, 이 훅은 dispatch를 이름 있는 동작으로 감쌉니다.
 */
export function useAppNavigation() {
  const [state, dispatch] = useReducer(navigationReducer, INITIAL_NAVIGATION_STATE);

  const actions = useMemo(
    () => ({
      pushAuthScreen: (screen: Exclude<AuthScreen, 'login'>) =>
        dispatch({type: 'pushAuthScreen', screen}),
      popAuthScreen: () => dispatch({type: 'popAuthScreen'}),
      openMainScreen: (screen: MainScreen) => dispatch({type: 'openMainScreen', screen}),
      closeHistory: () => dispatch({type: 'closeHistory'}),
      openDetail: (source: DetailSource, place: Place, context?: SavedPlaceViewContext) =>
        dispatch({type: 'openDetail', source, place, context: context ?? null}),
      closeDetail: () => dispatch({type: 'closeDetail'}),
      openLogin: () => dispatch({type: 'openLogin'}),
      openLoginFromGuest: (returnFlow: MainFlowState) =>
        dispatch({type: 'openLoginFromGuest', returnFlow}),
      returnToGuestFlow: () => dispatch({type: 'returnToGuestFlow'}),
      openGuestMain: () => dispatch({type: 'openGuestMain'}),
      openMemberMain: () => dispatch({type: 'openMemberMain'}),
    }),
    [],
  );

  return {...state, currentScreen: selectCurrentScreen(state.flow), ...actions};
}
