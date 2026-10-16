import {
  GUEST_MAIN_FLOW_STATE,
  INITIAL_FLOW_STATE,
  INITIAL_NAVIGATION_STATE,
  navigationReducer,
  selectCurrentScreen,
  type NavigationAction,
  type NavigationState,
} from '../src/app/navigation';
import type {Place} from '../src/entities/place/types';

const PLACE = {id: 'place-1', name: '군자역'} as unknown as Place;

function run(initial: NavigationState, ...actions: NavigationAction[]): NavigationState {
  return actions.reduce(navigationReducer, initial);
}

const MEMBER_MAIN = run(INITIAL_NAVIGATION_STATE, {type: 'openMemberMain'});

describe('navigationReducer: 인증 스택', () => {
  test('로그인 위에 화면을 쌓고 하나씩 걷어 내되 로그인은 남긴다', () => {
    const pushed = run(
      INITIAL_NAVIGATION_STATE,
      {type: 'pushAuthScreen', screen: 'emailLogin'},
      {type: 'pushAuthScreen', screen: 'terms'},
    );
    expect(pushed.flow).toEqual({kind: 'auth', stack: ['login', 'emailLogin', 'terms']});
    expect(selectCurrentScreen(pushed.flow)).toBe('terms');

    const popped = run(pushed, {type: 'popAuthScreen'}, {type: 'popAuthScreen'});
    expect(popped.flow).toEqual(INITIAL_FLOW_STATE);
    expect(navigationReducer(popped, {type: 'popAuthScreen'})).toBe(popped);
  });

  test('메인 흐름에서는 인증 스택 동작을 무시한다', () => {
    expect(navigationReducer(MEMBER_MAIN, {type: 'pushAuthScreen', screen: 'terms'})).toBe(
      MEMBER_MAIN,
    );
    expect(navigationReducer(MEMBER_MAIN, {type: 'popAuthScreen'})).toBe(MEMBER_MAIN);
  });
});

describe('navigationReducer: 메인 탭과 상세', () => {
  test('히스토리로 들어갈 때 돌아갈 탭을 기억하고 닫으면 그 탭으로 간다', () => {
    const onMap = run(MEMBER_MAIN, {type: 'openMainScreen', screen: 'map'});
    const onHistory = run(onMap, {type: 'openMainScreen', screen: 'history'});
    expect(onHistory.historyReturnTab).toBe('map');

    // 히스토리에서 히스토리를 다시 열어도 돌아갈 탭은 그대로다.
    const again = run(onHistory, {type: 'openMainScreen', screen: 'history'});
    expect(again.historyReturnTab).toBe('map');

    const closed = run(again, {type: 'closeHistory'});
    expect(closed.flow).toEqual({kind: 'main', activeTab: 'map', detailSource: null});
  });

  test('상세는 출발 탭을 활성 탭으로 두고 닫으면 선택을 비운다', () => {
    const opened = run(MEMBER_MAIN, {
      type: 'openDetail',
      source: 'map',
      place: PLACE,
      context: {source: 'map'} as never,
    });
    expect(opened.flow).toEqual({kind: 'main', activeTab: 'map', detailSource: 'map'});
    expect(opened.selectedPlace).toBe(PLACE);
    expect(selectCurrentScreen(opened.flow)).toBe('detail');

    const closed = run(opened, {type: 'closeDetail'});
    expect(closed.flow).toEqual({kind: 'main', activeTab: 'map', detailSource: null});
    expect(closed.selectedPlace).toBeNull();
    expect(closed.selectedPlaceViewContext).toBeNull();
  });

  test('탭을 옮기면 상세가 닫힌다', () => {
    const opened = run(MEMBER_MAIN, {
      type: 'openDetail',
      source: 'saved',
      place: PLACE,
      context: null,
    });
    const moved = run(opened, {type: 'openMainScreen', screen: 'my'});
    expect(moved.flow).toEqual({kind: 'main', activeTab: 'my', detailSource: null});
    expect(selectCurrentScreen(moved.flow)).toBe('my');
  });
});

describe('navigationReducer: 로그인과 비회원 복귀', () => {
  test('비회원이 로그인 화면으로 가면 보던 흐름을 기억하고 계속 둘러보기로 돌아온다', () => {
    const browsing = run(INITIAL_NAVIGATION_STATE, {type: 'openGuestMain'}, {
      type: 'openMainScreen',
      screen: 'map',
    });
    const atLogin = run(browsing, {type: 'openGuestLogin', returnFlow: browsing.flow as never});
    expect(atLogin.flow).toEqual(INITIAL_FLOW_STATE);
    expect(atLogin.guestReturnFlow).toEqual({kind: 'main', activeTab: 'map', detailSource: null});

    const returned = run(atLogin, {type: 'continueBrowsing'});
    expect(returned.flow).toEqual(browsing.flow);
    expect(returned.guestReturnFlow).toBeNull();
  });

  test('돌아갈 흐름이 없으면 계속 둘러보기와 잊기는 아무것도 바꾸지 않는다', () => {
    expect(navigationReducer(INITIAL_NAVIGATION_STATE, {type: 'continueBrowsing'})).toBe(
      INITIAL_NAVIGATION_STATE,
    );
    expect(navigationReducer(INITIAL_NAVIGATION_STATE, {type: 'forgetGuestReturnFlow'})).toBe(
      INITIAL_NAVIGATION_STATE,
    );
  });

  test('로그인에 성공하면 돌아갈 흐름을 잊고 보관함 탭에서 다시 시작한다', () => {
    const atLogin = run(INITIAL_NAVIGATION_STATE, {
      type: 'openGuestLogin',
      returnFlow: GUEST_MAIN_FLOW_STATE,
    });
    const withSelection = run(atLogin, {
      type: 'openDetail',
      source: 'saved',
      place: PLACE,
      context: null,
    });
    const signedIn = run(
      withSelection,
      {type: 'forgetGuestReturnFlow'},
      {type: 'openMemberMain'},
    );
    expect(signedIn.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: null});
    expect(signedIn.guestReturnFlow).toBeNull();
    expect(signedIn.selectedPlace).toBeNull();
  });

  test('이미 로그인 화면이거나 비회원 메인이면 같은 상태 객체를 돌려준다', () => {
    expect(navigationReducer(INITIAL_NAVIGATION_STATE, {type: 'openLogin'})).toBe(
      INITIAL_NAVIGATION_STATE,
    );
    const guest = run(INITIAL_NAVIGATION_STATE, {type: 'openGuestMain'});
    expect(navigationReducer(guest, {type: 'openGuestMain'})).toBe(guest);
    expect(guest.flow).toBe(GUEST_MAIN_FLOW_STATE);
  });
});
