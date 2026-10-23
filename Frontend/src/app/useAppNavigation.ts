import {useMemo, useReducer} from 'react';

import type {SavedPlaceViewContext} from '../analytics/savedPlaceEvents';
import type {Place} from '../entities/place/types';
import type {AuthScreen, DetailSource, MainFlowState, MainScreen} from '../types/navigation';
import {
  INITIAL_NAVIGATION_STATE,
  navigationReducer,
  selectCanGoBackMainTab,
  selectCurrentScreen,
  selectPreviousTab,
} from './navigation';

/**
 * 앱의 화면 흐름(인증 스택, 메인 탭과 탭 이력, 상세, 비회원 로그인 복귀)을 리듀서 하나로 관리합니다.
 * 전환 규칙은 navigation.ts의 순수 함수에 있고, 이 훅은 dispatch를 이름 있는 동작으로 감쌉니다.
 */
export function useAppNavigation() {
  const [state, dispatch] = useReducer(navigationReducer, INITIAL_NAVIGATION_STATE);

  const actions = useMemo(
    () => ({
      pushAuthScreen: (screen: Exclude<AuthScreen, 'login'>) =>
        dispatch({type: 'pushAuthScreen', screen}),
      popAuthScreen: () => dispatch({type: 'popAuthScreen'}),
      /** 탭 이력을 남기지 않고 메인 탭을 엽니다. 공유 결과처럼 사용자가 고르지 않은 이동에 씁니다. */
      openMainScreen: (screen: MainScreen) => dispatch({type: 'openMainScreen', screen}),
      /** 하단 메뉴로 탭을 옮깁니다. 보던 탭을 이력에 남겨 뒤로 가기가 돌아올 수 있게 합니다. */
      navigateMainTab: (screen: MainScreen) => dispatch({type: 'navigateMainTab', screen}),
      goBackMainTab: () => dispatch({type: 'goBackMainTab'}),
      openDetail: (source: DetailSource, place: Place, context?: SavedPlaceViewContext) =>
        dispatch({type: 'openDetail', source, place, context: context ?? null}),
      closeDetail: () => dispatch({type: 'closeDetail'}),
      openLogin: () => dispatch({type: 'openLogin'}),
      openLoginFromGuest: (returnFlow: MainFlowState) =>
        dispatch({type: 'openLoginFromGuest', returnFlow}),
      openLoginFromGuestShare: () => dispatch({type: 'openLoginFromGuestShare'}),
      returnToGuestFlow: () => dispatch({type: 'returnToGuestFlow'}),
      closeGuestLogin: () => dispatch({type: 'closeGuestLogin'}),
      openGuestMain: () => dispatch({type: 'openGuestMain'}),
      openMemberMain: () => dispatch({type: 'openMemberMain'}),
      endSession: () => dispatch({type: 'endSession'}),
    }),
    [],
  );

  return {
    ...state,
    currentScreen: selectCurrentScreen(state.flow),
    previousTab: selectPreviousTab(state),
    canGoBackMainTab: selectCanGoBackMainTab(state),
    ...actions,
  };
}
