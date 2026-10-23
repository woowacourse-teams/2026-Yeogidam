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

/** 메인 흐름의 첫 탭입니다. 탭 이력이 비면 뒤로 가기가 여기로 돌아오고, 머문 탭 목록도 여기서 시작합니다. */
const ROOT_TAB: MainScreen = 'saved';

export type NavigationState = {
  flow: AppFlowState;
  selectedPlace: Place | null;
  selectedPlaceViewContext: SavedPlaceViewContext | null;
  /** 하단 메뉴로 옮겨 오기 전에 보던 탭의 이력입니다. 뒤로 가면 마지막 탭으로, 비어 있으면 보관함으로 돌아갑니다. 끝은 지금 탭과 다릅니다. */
  mainTabHistory: MainScreen[];
  /** 이번 세션에 한 번이라도 보인 메인 탭입니다. 탭을 옮겨도 화면을 내리지 않고 뒤에 두어 상태를 지킵니다. */
  visitedTabs: MainScreen[];
  /** 비회원이 로그인 화면으로 가기 전에 보던 메인 흐름입니다. 둘러보기로 돌아갈 곳입니다. */
  guestReturnFlow: MainFlowState | null;
  /** 앱 안에서 연 로그인 화면이라 X로 직전 화면에 돌아갈 수 있는지입니다. 공유 화면에서 넘어온 로그인은 "로그인 없이 둘러보기"로 돌아갑니다. */
  showLoginCloseButton: boolean;
};

export type NavigationAction =
  | {type: 'pushAuthScreen'; screen: Exclude<AuthScreen, 'login'>}
  | {type: 'popAuthScreen'}
  | {type: 'openMainScreen'; screen: MainScreen}
  | {type: 'navigateMainTab'; screen: MainScreen}
  | {type: 'goBackMainTab'}
  | {
      type: 'openDetail';
      source: DetailSource;
      place: Place;
      context: SavedPlaceViewContext | null;
    }
  | {type: 'closeDetail'}
  | {type: 'openLogin'}
  | {type: 'openLoginFromGuest'; returnFlow: MainFlowState}
  | {type: 'openLoginFromGuestShare'}
  | {type: 'returnToGuestFlow'}
  | {type: 'closeGuestLogin'}
  | {type: 'openGuestMain'}
  | {type: 'openMemberMain'}
  | {type: 'endSession'};

export const INITIAL_NAVIGATION_STATE: NavigationState = {
  flow: INITIAL_FLOW_STATE,
  selectedPlace: null,
  selectedPlaceViewContext: null,
  mainTabHistory: [],
  visitedTabs: [ROOT_TAB],
  guestReturnFlow: null,
  showLoginCloseButton: false,
};

function withFlow(state: NavigationState, flow: AppFlowState): NavigationState {
  return state.flow === flow ? state : {...state, flow};
}

/** 메인 흐름이면 활성 탭을 머문 탭 목록에 더합니다. 이미 있으면 같은 상태를 돌려줍니다. */
function trackVisitedTab(state: NavigationState): NavigationState {
  if (state.flow.kind !== 'main' || state.visitedTabs.includes(state.flow.activeTab)) {
    return state;
  }
  return {...state, visitedTabs: [...state.visitedTabs, state.flow.activeTab]};
}

/**
 * 이력 끝이 지금 탭과 같으면 뺍니다. 하단 메뉴를 거치지 않는 이동(공유 결과가 여는 보관함, 둘러보기 복귀)이
 * 이력에 남은 탭으로 돌아오면 뒤로 가기가 같은 탭으로 가는 제자리걸음이 되고, 스와이프는 같은 층을 앞과 뒤로 잡기 때문입니다.
 */
function dropHistoryTailEqualToActiveTab(state: NavigationState): NavigationState {
  if (state.flow.kind !== 'main') return state;
  let history = state.mainTabHistory;
  while (history.length > 0 && history[history.length - 1] === state.flow.activeTab) {
    history = history.slice(0, -1);
  }
  return history === state.mainTabHistory ? state : {...state, mainTabHistory: history};
}

function reduce(state: NavigationState, action: NavigationAction): NavigationState {
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
    case 'openMainScreen':
      return {
        ...state,
        flow: {kind: 'main', activeTab: action.screen, detailSource: null},
      };
    case 'navigateMainTab': {
      // 하단 메뉴로 다른 탭에 갈 때만 보던 탭을 이력에 남깁니다. 상세가 열려 있으면 상세를 닫는 이동이라 남기지 않습니다.
      const mainTabHistory =
        state.flow.kind === 'main' &&
        state.flow.detailSource === null &&
        state.flow.activeTab !== action.screen
          ? [...state.mainTabHistory, state.flow.activeTab]
          : state.mainTabHistory;
      return {
        ...state,
        mainTabHistory,
        flow: {kind: 'main', activeTab: action.screen, detailSource: null},
      };
    }
    case 'goBackMainTab': {
      const previousTab = selectPreviousTab(state);
      if (state.flow.kind !== 'main' || state.flow.detailSource !== null || !previousTab) {
        return state;
      }
      return {
        ...state,
        mainTabHistory: state.mainTabHistory.slice(0, -1),
        flow: {...state.flow, activeTab: previousTab, detailSource: null},
      };
    }
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
    case 'openLoginFromGuest':
      return {
        ...state,
        guestReturnFlow: action.returnFlow,
        showLoginCloseButton: true,
        flow: INITIAL_FLOW_STATE,
      };
    case 'openLoginFromGuestShare':
      // 공유 화면에서 로그인을 누르고 넘어온 비회원은 "로그인 없이 둘러보기"로 비회원 메인에 돌아갑니다.
      return {...state, guestReturnFlow: GUEST_MAIN_FLOW_STATE, flow: INITIAL_FLOW_STATE};
    case 'returnToGuestFlow':
      if (!state.guestReturnFlow) return state;
      return {
        ...state,
        flow: state.guestReturnFlow,
        guestReturnFlow: null,
        showLoginCloseButton: false,
      };
    case 'closeGuestLogin':
      return {
        ...state,
        flow: state.guestReturnFlow ?? GUEST_MAIN_FLOW_STATE,
        guestReturnFlow: null,
        showLoginCloseButton: false,
      };
    case 'openGuestMain': {
      const next = withFlow(state, GUEST_MAIN_FLOW_STATE);
      return next.showLoginCloseButton ? {...next, showLoginCloseButton: false} : next;
    }
    case 'openMemberMain':
      // 회원이 되면 이전 회원이나 비회원이 보던 장소 선택, 돌아갈 비회원 흐름, 탭 이력을 남기지 않습니다.
      return {
        ...state,
        selectedPlace: null,
        selectedPlaceViewContext: null,
        mainTabHistory: [],
        visitedTabs: [ROOT_TAB],
        guestReturnFlow: null,
        showLoginCloseButton: false,
        flow: {kind: 'main', activeTab: ROOT_TAB, detailSource: null},
      };
    case 'endSession':
      // 로그아웃, 세션 만료, 탈퇴로 세션이 끝나면 로그인 화면으로 가고 탭 이력과 머문 탭을 비웁니다.
      return {
        ...state,
        mainTabHistory: [],
        visitedTabs: [ROOT_TAB],
        guestReturnFlow: null,
        showLoginCloseButton: false,
        flow: INITIAL_FLOW_STATE,
      };
  }
}

export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  const next = reduce(state, action);
  return next === state ? state : dropHistoryTailEqualToActiveTab(trackVisitedTab(next));
}

/** 흐름 상태에서 지금 그려야 할 화면 하나를 고릅니다. */
export function selectCurrentScreen(flow: AppFlowState): Screen {
  if (flow.kind === 'auth') return flow.stack[flow.stack.length - 1];
  return flow.detailSource ? 'detail' : flow.activeTab;
}

/** 메인 흐름에서 뒤로 가면 돌아갈 탭입니다. 이력이 비면 보관함이고, 보관함에서는 더 돌아갈 곳이 없습니다. */
export function selectPreviousTab(state: NavigationState): MainScreen | null {
  if (state.flow.kind !== 'main') return null;
  return (
    state.mainTabHistory[state.mainTabHistory.length - 1] ??
    (state.flow.activeTab === ROOT_TAB ? null : ROOT_TAB)
  );
}

/** 상세가 닫힌 메인 흐름에서 뒤로 갈 탭이 있는지입니다. 하드웨어 뒤로 가기가 앱을 닫을지 정할 때 씁니다. */
export function selectCanGoBackMainTab(state: NavigationState): boolean {
  return (
    state.flow.kind === 'main' &&
    state.flow.detailSource === null &&
    selectPreviousTab(state) !== null
  );
}

/** 내 정보 위에 겹쳐 여는 화면의 층 키입니다. */
function overlayLayerKey(overlay: string): string {
  return `myPage-${overlay}`;
}

/** 인증 스택의 층 키입니다. 같은 화면이 두 번 쌓여도 깊이로 구분합니다. */
export function authLayerKey(index: number, screen: AuthScreen): string {
  return `auth-${index}-${screen}`;
}

/** 뒤로 가기 스택이 맨 앞에 두는 층의 키입니다. 인증 스택은 깊이로, 메인은 겹침 화면, 상세, 활성 탭 순으로 고릅니다. */
export function selectActiveLayerKey(flow: AppFlowState, overlay: string | null): string {
  if (flow.kind === 'auth') {
    return authLayerKey(flow.stack.length - 1, flow.stack[flow.stack.length - 1]);
  }
  if (overlay !== null) return overlayLayerKey(overlay);
  return flow.detailSource !== null ? 'detail' : flow.activeTab;
}

/** 뒤로 가기 스와이프가 드러낼 층의 키입니다. 돌아갈 곳이 없으면 null이라 스와이프를 받지 않습니다. */
export function selectBackLayerKey(
  flow: AppFlowState,
  overlay: string | null,
  previousTab: MainScreen | null,
): string | null {
  if (flow.kind === 'auth') {
    return flow.stack.length > 1
      ? authLayerKey(flow.stack.length - 2, flow.stack[flow.stack.length - 2])
      : null;
  }
  if (overlay !== null) return flow.activeTab;
  return flow.detailSource ?? previousTab;
}
