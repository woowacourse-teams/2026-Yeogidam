import type {SavedPlaceViewContext} from '../analytics/savedPlaceEvents';
import type {Place} from '../entities/place/types';
import type {
  AppFlowState,
  AuthScreen,
  DetailSource,
  MainFlowState,
  MainScreen,
  Screen,
} from '../types/navigation';

/** 로그인 화면 하나만 쌓인 인증 흐름입니다. 앱의 첫 상태이기도 합니다. */
export const INITIAL_FLOW_STATE: AppFlowState = {
  kind: 'auth',
  stack: ['login'],
};

/** 비회원이 둘러보는 메인 흐름입니다. 보관함 탭에서 시작합니다. */
export const GUEST_MAIN_FLOW_STATE: MainFlowState = {
  kind: 'main',
  activeTab: 'saved',
  detailSource: null,
};

export type NavigationState = {
  flow: AppFlowState;
  selectedPlace: Place | null;
  selectedPlaceViewContext: SavedPlaceViewContext | null;
  /** 히스토리 화면에서 뒤로 갈 때 돌아갈 탭입니다. */
  historyReturnTab: MainScreen;
  /** 비회원이 로그인 화면으로 가기 전에 보던 메인 흐름입니다. "계속 둘러보기"가 돌아갈 곳입니다. */
  guestReturnFlow: MainFlowState | null;
};

export type NavigationAction =
  | {type: 'pushAuthScreen'; screen: Exclude<AuthScreen, 'login'>}
  | {type: 'popAuthScreen'}
  | {type: 'openMainScreen'; screen: MainScreen}
  | {type: 'closeHistory'}
  | {
      type: 'openDetail';
      source: DetailSource;
      place: Place;
      context: SavedPlaceViewContext | null;
    }
  | {type: 'closeDetail'}
  | {type: 'openLogin'}
  | {type: 'openGuestLogin'; returnFlow: MainFlowState}
  | {type: 'continueBrowsing'}
  | {type: 'forgetGuestReturnFlow'}
  | {type: 'openGuestMain'}
  | {type: 'openMemberMain'};

export const INITIAL_NAVIGATION_STATE: NavigationState = {
  flow: INITIAL_FLOW_STATE,
  selectedPlace: null,
  selectedPlaceViewContext: null,
  historyReturnTab: 'saved',
  guestReturnFlow: null,
};

function withFlow(state: NavigationState, flow: AppFlowState): NavigationState {
  return state.flow === flow ? state : {...state, flow};
}

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'pushAuthScreen':
      if (state.flow.kind !== 'auth') return state;
      return {
        ...state,
        flow: {...state.flow, stack: [...state.flow.stack, action.screen]},
      };
    case 'popAuthScreen':
      if (state.flow.kind !== 'auth' || state.flow.stack.length === 1) return state;
      return {
        ...state,
        flow: {...state.flow, stack: state.flow.stack.slice(0, -1)},
      };
    case 'openMainScreen': {
      // 히스토리로 들어갈 때만 돌아갈 탭을 기억하고, 히스토리끼리 옮길 때는 그대로 둡니다.
      const historyReturnTab =
        action.screen === 'history' &&
        state.flow.kind === 'main' &&
        state.flow.activeTab !== 'history'
          ? state.flow.activeTab
          : state.historyReturnTab;
      return {
        ...state,
        historyReturnTab,
        flow: {kind: 'main', activeTab: action.screen, detailSource: null},
      };
    }
    case 'closeHistory':
      return navigationReducer(state, {
        type: 'openMainScreen',
        screen: state.historyReturnTab,
      });
    case 'openDetail':
      return {
        ...state,
        selectedPlace: action.place,
        selectedPlaceViewContext: action.context,
        flow:
          state.flow.kind === 'main'
            ? {...state.flow, activeTab: action.source, detailSource: action.source}
            : state.flow,
      };
    case 'closeDetail':
      return {
        ...state,
        selectedPlace: null,
        selectedPlaceViewContext: null,
        flow: state.flow.kind === 'main' ? {...state.flow, detailSource: null} : state.flow,
      };
    case 'openLogin':
      return withFlow(state, INITIAL_FLOW_STATE);
    case 'openGuestLogin':
      return {...state, guestReturnFlow: action.returnFlow, flow: INITIAL_FLOW_STATE};
    case 'continueBrowsing':
      if (!state.guestReturnFlow) return state;
      return {...state, flow: state.guestReturnFlow, guestReturnFlow: null};
    case 'forgetGuestReturnFlow':
      return state.guestReturnFlow ? {...state, guestReturnFlow: null} : state;
    case 'openGuestMain':
      return withFlow(state, GUEST_MAIN_FLOW_STATE);
    case 'openMemberMain':
      // 로그인 직후에는 이전 회원이나 비회원이 보던 장소 선택을 남기지 않습니다.
      return {
        ...state,
        selectedPlace: null,
        selectedPlaceViewContext: null,
        flow: {kind: 'main', activeTab: 'saved', detailSource: null},
      };
  }
}

/** 흐름 상태에서 지금 그려야 할 화면 하나를 고릅니다. */
export function selectCurrentScreen(flow: AppFlowState): Screen {
  if (flow.kind === 'auth') return flow.stack[flow.stack.length - 1];
  return flow.detailSource ? 'detail' : flow.activeTab;
}
