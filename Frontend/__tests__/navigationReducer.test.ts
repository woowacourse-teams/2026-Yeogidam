import {
  GUEST_MAIN_FLOW_STATE,
  INITIAL_FLOW_STATE,
  INITIAL_NAVIGATION_STATE,
  navigationReducer,
  selectActiveLayerKey,
  selectBackLayerKey,
  selectCanGoBackMainTab,
  selectCurrentScreen,
  selectPreviousTab,
  type NavigationAction,
  type NavigationState,
} from '../src/app/navigation';
import type {Place} from '../src/entities/place/types';

const PLACE = {id: 'place-1', name: '군자역'} as unknown as Place;

function run(initial: NavigationState, ...actions: NavigationAction[]): NavigationState {
  return actions.reduce(navigationReducer, initial);
}

const MEMBER_MAIN = run(INITIAL_NAVIGATION_STATE, {type: 'openMemberMain'});
const GUEST_MAIN = run(INITIAL_NAVIGATION_STATE, {type: 'openGuestMain'});

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

describe('navigationReducer: 탭 이력과 뒤로 가기', () => {
  test('하단 메뉴로 옮긴 탭은 이력에 남고, 뒤로 가면 마지막 탭으로 돌아간다', () => {
    const onMap = run(MEMBER_MAIN, {type: 'navigateMainTab', screen: 'map'});
    const onHistory = run(onMap, {type: 'navigateMainTab', screen: 'history'});
    expect(onHistory.mainTabHistory).toEqual(['saved', 'map']);
    expect(selectPreviousTab(onHistory)).toBe('map');
    expect(selectCanGoBackMainTab(onHistory)).toBe(true);

    const backToMap = run(onHistory, {type: 'goBackMainTab'});
    expect(backToMap.flow).toEqual({kind: 'main', activeTab: 'map', detailSource: null});
    expect(backToMap.mainTabHistory).toEqual(['saved']);

    const backToSaved = run(backToMap, {type: 'goBackMainTab'});
    expect(backToSaved.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: null});
    expect(backToSaved.mainTabHistory).toEqual([]);
  });

  test('같은 탭을 다시 고르면 이력에 남기지 않는다', () => {
    const onMap = run(MEMBER_MAIN, {type: 'navigateMainTab', screen: 'map'});
    const again = run(onMap, {type: 'navigateMainTab', screen: 'map'});
    expect(again.mainTabHistory).toEqual(['saved']);
  });

  test('이력이 비어도 보관함이 아니면 보관함으로 돌아가고, 보관함에서는 더 돌아갈 곳이 없다', () => {
    const onMap = run(MEMBER_MAIN, {type: 'openMainScreen', screen: 'map'});
    expect(onMap.mainTabHistory).toEqual([]);
    expect(selectPreviousTab(onMap)).toBe('saved');

    const backToSaved = run(onMap, {type: 'goBackMainTab'});
    expect(backToSaved.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: null});
    expect(selectPreviousTab(backToSaved)).toBeNull();
    expect(selectCanGoBackMainTab(backToSaved)).toBe(false);
    expect(navigationReducer(backToSaved, {type: 'goBackMainTab'})).toBe(backToSaved);
  });

  test('상세가 열려 있으면 탭 뒤로 가기를 하지 않고, 상세를 닫는 탭 이동은 이력에 남기지 않는다', () => {
    const onMap = run(MEMBER_MAIN, {type: 'navigateMainTab', screen: 'map'});
    const detail = run(onMap, {type: 'openDetail', source: 'map', place: PLACE, context: null});
    expect(selectCanGoBackMainTab(detail)).toBe(false);
    expect(navigationReducer(detail, {type: 'goBackMainTab'})).toBe(detail);

    const moved = run(detail, {type: 'navigateMainTab', screen: 'my'});
    expect(moved.flow).toEqual({kind: 'main', activeTab: 'my', detailSource: null});
    expect(moved.mainTabHistory).toEqual(['saved']);
  });

  test('인증 흐름에서는 뒤로 갈 탭이 없다', () => {
    expect(selectPreviousTab(INITIAL_NAVIGATION_STATE)).toBeNull();
    expect(selectCanGoBackMainTab(INITIAL_NAVIGATION_STATE)).toBe(false);
    expect(navigationReducer(INITIAL_NAVIGATION_STATE, {type: 'goBackMainTab'})).toBe(
      INITIAL_NAVIGATION_STATE,
    );
  });
});

describe('navigationReducer: 머문 탭', () => {
  test('보인 탭은 순서대로 쌓이고 같은 탭은 한 번만 둔다', () => {
    expect(MEMBER_MAIN.visitedTabs).toEqual(['saved']);
    const visited = run(
      MEMBER_MAIN,
      {type: 'navigateMainTab', screen: 'map'},
      {type: 'navigateMainTab', screen: 'my'},
      {type: 'goBackMainTab'},
      {type: 'navigateMainTab', screen: 'map'},
    );
    expect(visited.visitedTabs).toEqual(['saved', 'map', 'my']);
  });

  test('상세를 열면 출발 탭을 머문 탭에 두고, 로그인 화면으로 갔다 돌아와도 머문 탭은 그대로다', () => {
    const detail = run(GUEST_MAIN, {
      type: 'openDetail',
      source: 'map',
      place: PLACE,
      context: null,
    });
    expect(detail.visitedTabs).toEqual(['saved', 'map']);

    const atLogin = run(detail, {type: 'openLoginFromGuest', returnFlow: detail.flow as never});
    expect(atLogin.visitedTabs).toEqual(['saved', 'map']);
    expect(run(atLogin, {type: 'returnToGuestFlow'}).visitedTabs).toEqual(['saved', 'map']);
  });

  test('회원이 되거나 세션이 끝나면 머문 탭과 탭 이력을 처음으로 되돌린다', () => {
    const browsed = run(
      GUEST_MAIN,
      {type: 'navigateMainTab', screen: 'map'},
      {type: 'navigateMainTab', screen: 'history'},
    );

    const member = run(browsed, {type: 'openMemberMain'});
    expect(member.visitedTabs).toEqual(['saved']);
    expect(member.mainTabHistory).toEqual([]);

    const ended = run(browsed, {type: 'endSession'});
    expect(ended.flow).toEqual(INITIAL_FLOW_STATE);
    expect(ended.visitedTabs).toEqual(['saved']);
    expect(ended.mainTabHistory).toEqual([]);
    expect(ended.guestReturnFlow).toBeNull();
    expect(ended.showLoginCloseButton).toBe(false);
  });
});

describe('navigationReducer: 상세', () => {
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

  test('공유 결과로 여는 보관함 탭은 상세를 닫고 이력에 남기지 않으며, 이력 끝이 보관함이면 그 이력을 뺀다', () => {
    const opened = run(MEMBER_MAIN, {type: 'navigateMainTab', screen: 'map'}, {
      type: 'openDetail',
      source: 'map',
      place: PLACE,
      context: null,
    });
    const moved = run(opened, {type: 'openMainScreen', screen: 'saved'});
    expect(moved.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: null});
    expect(moved.mainTabHistory).toEqual([]);
  });
});

describe('navigationReducer: 하단 메뉴를 거치지 않고 이력 끝의 탭으로 돌아오는 이동', () => {
  test('지도에서 공유 결과로 보관함이 열리면 이력 끝의 보관함을 빼, 뒤로 가기가 같은 탭에 머물지 않고 스와이프가 같은 층을 잡지 않는다', () => {
    const onMap = run(MEMBER_MAIN, {type: 'navigateMainTab', screen: 'map'});
    expect(onMap.mainTabHistory).toEqual(['saved']);

    const shared = run(onMap, {type: 'openMainScreen', screen: 'saved'});
    expect(shared.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: null});
    expect(shared.mainTabHistory).toEqual([]);
    expect(selectPreviousTab(shared)).toBeNull();
    expect(selectCanGoBackMainTab(shared)).toBe(false);
    expect(selectBackLayerKey(shared.flow, null, selectPreviousTab(shared))).toBeNull();
    expect(navigationReducer(shared, {type: 'goBackMainTab'})).toBe(shared);
  });

  test('이력 끝이 다른 탭이면 그대로 두어 뒤로 가기 한 번에 그 탭으로 돌아간다', () => {
    const onMy = run(
      MEMBER_MAIN,
      {type: 'navigateMainTab', screen: 'map'},
      {type: 'navigateMainTab', screen: 'my'},
    );
    const shared = run(onMy, {type: 'openMainScreen', screen: 'saved'});
    expect(shared.mainTabHistory).toEqual(['saved', 'map']);
    expect(selectPreviousTab(shared)).toBe('map');
    expect(selectBackLayerKey(shared.flow, null, selectPreviousTab(shared))).toBe('map');

    const backToMap = run(shared, {type: 'goBackMainTab'});
    expect(backToMap.flow).toEqual({kind: 'main', activeTab: 'map', detailSource: null});
    expect(backToMap.mainTabHistory).toEqual(['saved']);
    const backToSaved = run(backToMap, {type: 'goBackMainTab'});
    expect(backToSaved.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: null});
    expect(selectCanGoBackMainTab(backToSaved)).toBe(false);
  });

  test('지도를 보던 비회원이 공유 로그인 유도를 거쳐 둘러보기로 비회원 메인에 돌아오면 이력 끝의 보관함을 뺀다', () => {
    const onMap = run(GUEST_MAIN, {type: 'navigateMainTab', screen: 'map'});
    const returned = run(onMap, {type: 'openLoginFromGuestShare'}, {type: 'returnToGuestFlow'});
    expect(returned.flow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(returned.mainTabHistory).toEqual([]);

    const browsedAgain = run(onMap, {type: 'openLogin'}, {type: 'openGuestMain'});
    expect(browsedAgain.flow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(browsedAgain.mainTabHistory).toEqual([]);
  });

  test('하단 메뉴 이동만 이력에 남기는 규칙은 그대로다', () => {
    const onMap = run(MEMBER_MAIN, {type: 'openMainScreen', screen: 'map'});
    expect(onMap.mainTabHistory).toEqual([]);
    const onHistory = run(onMap, {type: 'navigateMainTab', screen: 'history'});
    expect(onHistory.mainTabHistory).toEqual(['map']);
  });

  test('상세의 하단 메뉴로 이력 끝의 탭에 가면 이력을 쌓지 않는 대신 끝의 같은 탭을 빼, 뒤 층이 그 전 탭이 된다', () => {
    // 보관함, 지도, 보관함 순으로 하단 메뉴를 누르면 이력은 [saved, map]이다.
    const backOnSaved = run(
      MEMBER_MAIN,
      {type: 'navigateMainTab', screen: 'map'},
      {type: 'navigateMainTab', screen: 'saved'},
    );
    expect(backOnSaved.mainTabHistory).toEqual(['saved', 'map']);

    // 보관함 상세를 열고 상세의 하단 메뉴로 지도에 간다. 상세를 닫는 이동이라 보관함은 쌓지 않는다.
    const detail = run(backOnSaved, {type: 'openDetail', source: 'saved', place: PLACE, context: null});
    const onMap = run(detail, {type: 'navigateMainTab', screen: 'map'});
    expect(onMap.flow).toEqual({kind: 'main', activeTab: 'map', detailSource: null});
    expect(onMap.mainTabHistory).toEqual(['saved']);
    expect(selectPreviousTab(onMap)).toBe('saved');
    expect(selectBackLayerKey(onMap.flow, null, selectPreviousTab(onMap))).toBe('saved');

    const back = run(onMap, {type: 'goBackMainTab'});
    expect(back.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: null});
    expect(back.mainTabHistory).toEqual([]);
  });

  test('지도를 보던 비회원이 로그인 화면의 X로 비회원 메인에 돌아오면 이력 끝의 보관함을 뺀다', () => {
    const onMap = run(GUEST_MAIN, {type: 'navigateMainTab', screen: 'map'});
    expect(onMap.mainTabHistory).toEqual(['saved']);

    // 공유 로그인 유도로 간 로그인 화면은 돌아갈 흐름이 비회원 메인이다.
    const fromShare = run(onMap, {type: 'openLoginFromGuestShare'}, {type: 'closeGuestLogin'});
    expect(fromShare.flow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(fromShare.mainTabHistory).toEqual([]);
    expect(selectBackLayerKey(fromShare.flow, null, selectPreviousTab(fromShare))).toBeNull();

    // 돌아갈 흐름 없이 로그인 화면에 갔다가 X로 나와도 같다.
    const fromLogin = run(onMap, {type: 'openLogin'}, {type: 'closeGuestLogin'});
    expect(fromLogin.flow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(fromLogin.mainTabHistory).toEqual([]);
  });
});

describe('navigationReducer: 로그인과 비회원 복귀', () => {
  test('앱 안에서 로그인 화면을 연 비회원은 X로 보던 흐름에 돌아온다', () => {
    const browsing = run(GUEST_MAIN, {type: 'navigateMainTab', screen: 'map'});
    const atLogin = run(browsing, {type: 'openLoginFromGuest', returnFlow: browsing.flow as never});
    expect(atLogin.flow).toEqual(INITIAL_FLOW_STATE);
    expect(atLogin.guestReturnFlow).toEqual({kind: 'main', activeTab: 'map', detailSource: null});
    expect(atLogin.showLoginCloseButton).toBe(true);

    const closed = run(atLogin, {type: 'closeGuestLogin'});
    expect(closed.flow).toEqual(browsing.flow);
    expect(closed.guestReturnFlow).toBeNull();
    expect(closed.showLoginCloseButton).toBe(false);
    // 탭 이력은 로그인 화면을 다녀와도 그대로라 뒤로 가기가 이어진다.
    expect(closed.mainTabHistory).toEqual(['saved']);
  });

  test('돌아갈 흐름 없이 X를 누르면 비회원 메인으로 간다', () => {
    const closed = run(INITIAL_NAVIGATION_STATE, {type: 'closeGuestLogin'});
    expect(closed.flow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(closed.showLoginCloseButton).toBe(false);
  });

  test('공유 화면에서 넘어온 비회원은 X 없이 "로그인 없이 둘러보기"로 비회원 메인에 돌아온다', () => {
    const atLogin = run(GUEST_MAIN, {type: 'openLoginFromGuestShare'});
    expect(atLogin.flow).toEqual(INITIAL_FLOW_STATE);
    expect(atLogin.guestReturnFlow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(atLogin.showLoginCloseButton).toBe(false);

    const returned = run(atLogin, {type: 'returnToGuestFlow'});
    expect(returned.flow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(returned.guestReturnFlow).toBeNull();
  });

  test('계속 둘러보기는 보던 흐름으로 돌아오고 X 표시를 내린다', () => {
    const atLogin = run(GUEST_MAIN, {type: 'openLoginFromGuest', returnFlow: GUEST_MAIN_FLOW_STATE});
    const returned = run(atLogin, {type: 'returnToGuestFlow'});
    expect(returned.flow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(returned.guestReturnFlow).toBeNull();
    expect(returned.showLoginCloseButton).toBe(false);
  });

  test('돌아갈 흐름이 없으면 계속 둘러보기는 아무것도 바꾸지 않는다', () => {
    expect(navigationReducer(INITIAL_NAVIGATION_STATE, {type: 'returnToGuestFlow'})).toBe(
      INITIAL_NAVIGATION_STATE,
    );
  });

  test('로그인 없이 둘러보기는 X 표시를 내리고 비회원 메인으로 간다', () => {
    const atLogin = run(INITIAL_NAVIGATION_STATE, {
      type: 'openLoginFromGuest',
      returnFlow: GUEST_MAIN_FLOW_STATE,
    });
    const guest = run(atLogin, {type: 'openGuestMain'});
    expect(guest.flow).toBe(GUEST_MAIN_FLOW_STATE);
    expect(guest.showLoginCloseButton).toBe(false);
  });

  test('로그인에 성공하면 돌아갈 흐름과 X 표시를 잊고 보관함 탭에서 다시 시작한다', () => {
    const atLogin = run(INITIAL_NAVIGATION_STATE, {
      type: 'openLoginFromGuest',
      returnFlow: GUEST_MAIN_FLOW_STATE,
    });
    const withSelection = run(atLogin, {
      type: 'openDetail',
      source: 'saved',
      place: PLACE,
      context: null,
    });
    const signedIn = run(withSelection, {type: 'openMemberMain'});
    expect(signedIn.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: null});
    expect(signedIn.guestReturnFlow).toBeNull();
    expect(signedIn.showLoginCloseButton).toBe(false);
    expect(signedIn.selectedPlace).toBeNull();
  });

  test('이미 로그인 화면이거나 비회원 메인이면 같은 상태 객체를 돌려준다', () => {
    expect(navigationReducer(INITIAL_NAVIGATION_STATE, {type: 'openLogin'})).toBe(
      INITIAL_NAVIGATION_STATE,
    );
    expect(navigationReducer(GUEST_MAIN, {type: 'openGuestMain'})).toBe(GUEST_MAIN);
    expect(GUEST_MAIN.flow).toBe(GUEST_MAIN_FLOW_STATE);
  });

  test('회원이 로그인 화면으로 가면 탭 이력은 그대로 두고 흐름만 바꾼다', () => {
    const browsed = run(MEMBER_MAIN, {type: 'navigateMainTab', screen: 'map'});
    const atLogin = run(browsed, {type: 'openLogin'});
    expect(atLogin.flow).toEqual(INITIAL_FLOW_STATE);
    expect(atLogin.mainTabHistory).toEqual(['saved']);
    expect(atLogin.showLoginCloseButton).toBe(false);
  });
});

describe('navigationReducer: 리뷰에서 더한 경계', () => {
  test('상세 화면에서 로그인으로 갔다가 돌아오면 상세와 선택 장소가 그대로다', () => {
    const detail = run(GUEST_MAIN, {
      type: 'openDetail',
      source: 'saved',
      place: PLACE,
      context: null,
    });
    const atLogin = run(detail, {type: 'openLoginFromGuest', returnFlow: detail.flow as never});
    const returned = run(atLogin, {type: 'closeGuestLogin'});
    expect(returned.flow).toEqual({kind: 'main', activeTab: 'saved', detailSource: 'saved'});
    expect(returned.selectedPlace).toBe(PLACE);
    expect(selectCurrentScreen(returned.flow)).toBe('detail');
  });

  test('인증 흐름에서는 상세를 열어도 화면이 바뀌지 않는다', () => {
    const opened = run(INITIAL_NAVIGATION_STATE, {
      type: 'openDetail',
      source: 'map',
      place: PLACE,
      context: null,
    });
    expect(opened.flow).toEqual(INITIAL_FLOW_STATE);
    expect(selectCurrentScreen(opened.flow)).toBe('login');
  });

  test('이미 로그인 화면이어도 비회원 로그인 진입은 새 상태를 만들고 돌아갈 흐름을 기억한다', () => {
    const next = navigationReducer(INITIAL_NAVIGATION_STATE, {
      type: 'openLoginFromGuest',
      returnFlow: GUEST_MAIN_FLOW_STATE,
    });
    expect(next).not.toBe(INITIAL_NAVIGATION_STATE);
    expect(next.guestReturnFlow).toBe(GUEST_MAIN_FLOW_STATE);
  });
});

describe('뒤로 가기 스택의 층 키', () => {
  test('인증 스택은 깊이와 화면으로 키를 만들고 아래 화면이 없으면 뒤 층이 없다', () => {
    expect(selectActiveLayerKey(INITIAL_FLOW_STATE, null)).toBe('auth-0-login');
    expect(selectBackLayerKey(INITIAL_FLOW_STATE, null, null)).toBeNull();

    const pushed = run(INITIAL_NAVIGATION_STATE, {type: 'pushAuthScreen', screen: 'terms'});
    expect(selectActiveLayerKey(pushed.flow, null)).toBe('auth-1-terms');
    expect(selectBackLayerKey(pushed.flow, null, null)).toBe('auth-0-login');
  });

  test('메인 흐름은 활성 탭이 앞이고 돌아갈 탭이 뒤다', () => {
    const onMap = run(MEMBER_MAIN, {type: 'navigateMainTab', screen: 'map'});
    expect(selectActiveLayerKey(onMap.flow, null)).toBe('map');
    expect(selectBackLayerKey(onMap.flow, null, selectPreviousTab(onMap))).toBe('saved');
    expect(selectBackLayerKey(MEMBER_MAIN.flow, null, selectPreviousTab(MEMBER_MAIN))).toBeNull();
  });

  test('상세는 출발 탭 위에, 내 정보 겹침 화면은 활성 탭 위에 놓인다', () => {
    const detail = run(MEMBER_MAIN, {type: 'openDetail', source: 'map', place: PLACE, context: null});
    expect(selectActiveLayerKey(detail.flow, null)).toBe('detail');
    expect(selectBackLayerKey(detail.flow, null, selectPreviousTab(detail))).toBe('map');

    const onMy = run(MEMBER_MAIN, {type: 'navigateMainTab', screen: 'my'});
    expect(selectActiveLayerKey(onMy.flow, 'terms')).toBe('myPage-terms');
    expect(selectBackLayerKey(onMy.flow, 'terms', selectPreviousTab(onMy))).toBe('my');
  });
});
