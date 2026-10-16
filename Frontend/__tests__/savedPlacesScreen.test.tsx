import {Alert, ScrollView} from 'react-native';

import {
  captureSavedPlaceSelected,
  captureSavedPlacesViewed,
} from '../src/analytics/savedPlaceEvents';
import {getReelProcessingStatus, saveContent} from '../src/entities/content/api';
import {ReelApiError} from '../src/entities/content/errors';
import {getHistoryReels} from '../src/entities/content/history-api';
import type {HistoryReel} from '../src/entities/content/types';
import {deleteSavedPlaces, getSavedPlaces} from '../src/entities/info/api';
import type {SavedPlaceListItem} from '../src/entities/info/types';
import {getSharedSaveState, setSharedSaveState} from '../src/lib/reel-save-state';
import {getRecentSearches, setRecentSearches} from '../src/lib/searchHistoryStorage';
import {SavedPlaceGrid} from '../src/pages/saved-places/components/SavedPlaceGrid';
import {SavedPlacesEmptyState} from '../src/pages/saved-places/components/SavedPlacesEmptyState';
import {SavedPlacesErrorState} from '../src/pages/saved-places/components/SavedPlacesErrorState';
import {SavedPlacesSearchPanel} from '../src/pages/saved-places/components/SavedPlacesSearchPanel';
import {SavedPlacesSkeleton} from '../src/pages/saved-places/components/SavedPlacesSkeleton';
import {clearSavedPlacesCache} from '../src/pages/saved-places/hooks/useSavedPlacesList';
import {deferred} from './support/deferred';
import {
  AUTH_ERROR,
  BAKERY,
  CAFE,
  GUEST_PLACES,
  historyReel,
  LINK,
  listing,
  reelStatus,
  SERVER_ERROR,
  sharedShare,
  TIMEOUT_ERROR,
} from './support/savedPlacesFixtures';
import {
  act,
  deleteAction,
  dialog,
  flush,
  grid,
  header,
  openDialogAndSave,
  placeNamed,
  placeNames,
  pressAround,
  pressLabel,
  pressText,
  refreshControl,
  render,
  renderLoaded,
  searchPanel,
  selectAndDelete,
  setUpSavedPlacesScreenTests,
  texts,
  tick,
  unmount,
} from './support/savedPlacesHarness';

// 화면을 쪼개기 전에 지금 동작을 고정한다. 이상해 보이는 동작도 고치지 않고 그대로 적는다.

const mockPostHog = {capture: jest.fn()};

jest.mock('posthog-react-native', () => ({usePostHog: () => mockPostHog}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('../src/components/BottomNavigationBar', () => ({
  BOTTOM_NAVIGATION_BAR_HEIGHT: 64,
  bottomNavigationBarContainerStyle: {},
  getBottomNavigationBarOffset: () => 0,
}));
jest.mock('../src/analytics/savedPlaceEvents', () => ({
  captureSavedPlaceSelected: jest.fn(),
  captureSavedPlacesSearchSubmitted: jest.fn(),
  captureSavedPlacesViewed: jest.fn(),
}));
jest.mock('../src/lib/searchHistoryStorage', () => ({
  getRecentSearches: jest.fn(),
  setRecentSearches: jest.fn(),
}));
jest.mock('../src/entities/info/api', () => ({
  getSavedPlaces: jest.fn(),
  deleteSavedPlaces: jest.fn(),
}));
jest.mock('../src/entities/content/api', () => ({
  getReelProcessingStatus: jest.fn(),
  normalizeInstagramContentUrl: (value: string) => value.trim(),
  saveContent: jest.fn(),
}));
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReels: jest.fn(),
}));

setUpSavedPlacesScreenTests();

describe('목록 읽기', () => {
  test('처음 열면 스켈레톤을 보이고, 목록을 읽으면 그리드에 그린다', async () => {
    const request = deferred<SavedPlaceListItem[]>();
    jest.mocked(getSavedPlaces).mockReturnValue(request.promise);
    const renderer = await render();
    expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(1);

    await act(async () => request.resolve([CAFE, BAKERY]));
    expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(0);
    expect(placeNames(renderer)).toEqual(['카페', '빵집']);
    expect(getSavedPlaces).toHaveBeenCalledTimes(1);
  });

  test('저장한 장소가 없으면 빈 화면을 보인다', async () => {
    const renderer = await renderLoaded([]);
    expect(renderer.root.findAllByType(SavedPlacesEmptyState)).toHaveLength(1);
  });

  test('첫 조회가 실패하면 오류 화면을 보이고, 다시 시도해 성공하면 그리드와 조회 이벤트를 보낸다', async () => {
    jest.mocked(getSavedPlaces).mockRejectedValueOnce(SERVER_ERROR).mockResolvedValueOnce([CAFE]);
    const renderer = await render();
    await flush();
    const errorState = renderer.root.findByType(SavedPlacesErrorState);
    expect(errorState.props.error).toEqual(SERVER_ERROR);
    expect(captureSavedPlacesViewed).not.toHaveBeenCalled();

    await act(async () => errorState.props.onRetry());
    await flush();
    expect(placeNames(renderer)).toEqual(['카페']);
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
    expect(captureSavedPlacesViewed).toHaveBeenCalledWith(mockPostHog, {
      placeCount: 1,
      entryType: 'direct',
    });
  });

  test('장소가 있는 채로 다시 읽다 실패하면 목록을 두고 오류 배너의 재시도로 다시 읽는다', async () => {
    jest
      .mocked(getSavedPlaces)
      .mockResolvedValueOnce([CAFE])
      .mockRejectedValueOnce(SERVER_ERROR)
      .mockResolvedValueOnce([CAFE, BAKERY]);
    const renderer = await render();
    await flush();

    await act(async () => refreshControl(renderer).props.onRefresh());
    await flush();
    expect(texts(renderer)).toContain(SERVER_ERROR.message);
    expect(placeNames(renderer)).toEqual(['카페']);

    await pressText(renderer, '재시도');
    expect(texts(renderer)).not.toContain(SERVER_ERROR.message);
    expect(placeNames(renderer)).toEqual(['카페', '빵집']);
  });

  test('목록 조회가 AUTH401_001로 실패하면 인증이 필요하다고 알린다', async () => {
    const onAuthenticationRequired = jest.fn();
    jest.mocked(getSavedPlaces).mockRejectedValue(AUTH_ERROR);
    await render({onAuthenticationRequired});
    await flush();
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
  });

  test('새로고침 중에 다시 당기면 목록을 더 읽지 않고, 끝나면 새로고침 표시를 내린다', async () => {
    const renderer = await renderLoaded([CAFE]);
    const refresh = deferred<SavedPlaceListItem[]>();
    jest.mocked(getSavedPlaces).mockReturnValueOnce(refresh.promise);

    await act(async () => {
      refreshControl(renderer).props.onRefresh();
    });
    expect(refreshControl(renderer).props.refreshing).toBe(true);
    await act(async () => {
      refreshControl(renderer).props.onRefresh();
    });
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);

    await act(async () => refresh.resolve([CAFE, BAKERY]));
    await flush();
    expect(refreshControl(renderer).props.refreshing).toBe(false);
    expect(placeNames(renderer)).toEqual(['카페', '빵집']);

    await act(async () => refreshControl(renderer).props.onRefresh());
    expect(getSavedPlaces).toHaveBeenCalledTimes(3);
  });

  test('다시 열면 지난 목록을 먼저 보이고, 늦게 도착한 이전 조회 응답은 새 응답을 덮지 않는다', async () => {
    await unmount(await renderLoaded([CAFE]));

    const mountLoad = deferred<SavedPlaceListItem[]>();
    const refreshLoad = deferred<SavedPlaceListItem[]>();
    jest
      .mocked(getSavedPlaces)
      .mockReturnValueOnce(mountLoad.promise)
      .mockReturnValueOnce(refreshLoad.promise);
    const renderer = await render();
    expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(0);
    expect(placeNames(renderer)).toEqual(['카페']);

    await act(async () => {
      refreshControl(renderer).props.onRefresh();
    });
    await act(async () => refreshLoad.resolve([CAFE, BAKERY]));
    await act(async () => mountLoad.resolve([BAKERY]));
    await flush();
    expect(placeNames(renderer)).toEqual(['카페', '빵집']);
  });

  test('세션이 끝나 캐시를 비우면 다시 열 때 지난 목록 대신 스켈레톤을 보인다', async () => {
    await unmount(await renderLoaded([CAFE]));
    clearSavedPlacesCache();

    const request = deferred<SavedPlaceListItem[]>();
    jest.mocked(getSavedPlaces).mockReturnValue(request.promise);
    const renderer = await render();
    expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(1);
    expect(renderer.root.findAllByType(SavedPlaceGrid)).toHaveLength(0);

    await act(async () => request.resolve([BAKERY]));
    expect(placeNames(renderer)).toEqual(['빵집']);
  });

  test('세션이 끝나기 전에 보낸 목록 조회가 늦게 끝나도 비운 캐시를 다시 채우지 않는다', async () => {
    const lateLoad = deferred<SavedPlaceListItem[]>();
    jest.mocked(getSavedPlaces).mockReturnValueOnce(lateLoad.promise);
    await unmount(await render());
    clearSavedPlacesCache();
    await act(async () => lateLoad.resolve([CAFE]));
    await flush();

    jest.mocked(getSavedPlaces).mockReturnValue(deferred<SavedPlaceListItem[]>().promise);
    const renderer = await render();
    expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(1);
    expect(renderer.root.findAllByType(SavedPlaceGrid)).toHaveLength(0);
  });
});

describe('편집과 삭제', () => {
  test('편집을 누르면 편집 모드가 되고, 장소를 눌러 골랐다 풀며, 취소하면 끝난다', async () => {
    const onEditModeChange = jest.fn();
    const renderer = await renderLoaded([CAFE, BAKERY], {onEditModeChange});

    await pressLabel(renderer, '보관함 편집');
    expect(onEditModeChange).toHaveBeenLastCalledWith(true);
    expect(grid(renderer).props.isEditing).toBe(true);

    await act(async () => grid(renderer).props.onTogglePlaceSelection('place-1'));
    expect([...grid(renderer).props.selectedPlaceIds]).toEqual(['place-1']);
    expect(texts(renderer)).toContain('삭제하기');

    await act(async () => grid(renderer).props.onTogglePlaceSelection('place-1'));
    expect(grid(renderer).props.selectedPlaceIds.size).toBe(0);

    await pressLabel(renderer, '보관함 편집 취소');
    expect(onEditModeChange).toHaveBeenLastCalledWith(false);
    expect(grid(renderer).props.isEditing).toBe(false);
  });

  test('장소를 길게 누르면 편집 모드가 된다', async () => {
    const onEditModeChange = jest.fn();
    const renderer = await renderLoaded([CAFE], {onEditModeChange});
    await act(async () => grid(renderer).props.onLongPressPlace());
    expect(grid(renderer).props.isEditing).toBe(true);
    expect(onEditModeChange).toHaveBeenLastCalledWith(true);
  });

  test('고른 장소를 확인 뒤 지우면 저장 ID로 지우고 목록에서 빼며 편집을 끝낸다', async () => {
    const onEditModeChange = jest.fn();
    const renderer = await renderLoaded([CAFE, BAKERY], {onEditModeChange});
    await selectAndDelete(renderer, 'place-1');

    expect(Alert.alert).toHaveBeenCalledWith(
      '선택한 장소를 삭제할까요?',
      '선택한 1곳의 장소가 보관함에서 삭제됩니다.',
      expect.any(Array),
    );
    expect(deleteSavedPlaces).toHaveBeenCalledWith(['saved-1']);
    expect(placeNames(renderer)).toEqual(['빵집']);
    expect(grid(renderer).props.isEditing).toBe(false);
    expect(onEditModeChange).toHaveBeenLastCalledWith(false);

    // 삭제가 끝나면 다시 고르고 지울 수 있다.
    await pressLabel(renderer, '보관함 편집');
    await act(async () => grid(renderer).props.onTogglePlaceSelection('place-2'));
    expect(texts(renderer)).toContain('삭제하기');
    expect(deleteAction(renderer).props.disabled).toBe(false);
  });

  test('삭제 중에 편집을 껐다 켜도 삭제가 끝날 때까지 아래 버튼을 막고, 끝나면 편집을 끈다', async () => {
    // 지금 동작을 그대로 적는다. 위쪽 편집 버튼은 삭제 중에도 눌린다.
    const request = deferred<void>();
    jest.mocked(deleteSavedPlaces).mockReturnValue(request.promise);
    const renderer = await renderLoaded([CAFE, BAKERY]);
    await selectAndDelete(renderer, 'place-1');
    expect(texts(renderer)).toContain('삭제 중...');

    await pressLabel(renderer, '보관함 편집 취소');
    await pressLabel(renderer, '보관함 편집');
    expect(grid(renderer).props.isEditing).toBe(true);
    expect(deleteAction(renderer).props.disabled).toBe(true);

    await act(async () => request.resolve());
    await flush();
    expect(grid(renderer).props.isEditing).toBe(false);
    expect(placeNames(renderer)).toEqual(['빵집']);
  });

  test('삭제가 실패하면 편집을 유지한 채 오류 배너를 보이고, 재시도로 다시 지운다', async () => {
    jest.mocked(deleteSavedPlaces).mockRejectedValueOnce(SERVER_ERROR).mockResolvedValueOnce(undefined);
    const renderer = await renderLoaded([CAFE, BAKERY]);
    await selectAndDelete(renderer, 'place-1');
    expect(texts(renderer)).toContain(SERVER_ERROR.message);
    expect(grid(renderer).props.isEditing).toBe(true);

    await pressText(renderer, '재시도');
    expect(deleteSavedPlaces).toHaveBeenCalledTimes(2);
    expect(texts(renderer)).not.toContain(SERVER_ERROR.message);
    expect(placeNames(renderer)).toEqual(['빵집']);
  });

  test('삭제가 AUTH401_001로 실패하면 인증이 필요하다고 알린다', async () => {
    const onAuthenticationRequired = jest.fn();
    jest.mocked(deleteSavedPlaces).mockRejectedValue(AUTH_ERROR);
    const renderer = await renderLoaded([CAFE], {onAuthenticationRequired});
    await selectAndDelete(renderer, 'place-1');
    expect(onAuthenticationRequired).toHaveBeenCalledTimes(1);
    expect(texts(renderer)).toContain(AUTH_ERROR.message);

    // 편집을 켜고 끌 때 삭제 오류 배너도 함께 치운다.
    await pressLabel(renderer, '보관함 편집 취소');
    expect(texts(renderer)).not.toContain(AUTH_ERROR.message);
  });

  test('삭제 응답이 늦어 실패해도 다시 읽은 목록에 없으면 지운 것으로 보고 편집을 끝낸다', async () => {
    jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
    const renderer = await renderLoaded([CAFE, BAKERY]);
    jest.mocked(getSavedPlaces).mockResolvedValue([BAKERY]);
    await selectAndDelete(renderer, 'place-1');

    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
    expect(placeNames(renderer)).toEqual(['빵집']);
    expect(grid(renderer).props.isEditing).toBe(false);
    expect(texts(renderer)).not.toContain(TIMEOUT_ERROR.message);
  });

  test('저장 ID가 없는 장소를 지우려 하면 API를 부르지 않고 요청 오류를 보인다', async () => {
    const renderer = await render({places: GUEST_PLACES});
    await selectAndDelete(renderer, 'guest-1');
    expect(deleteSavedPlaces).not.toHaveBeenCalled();
    expect(texts(renderer)).toContain('요청 내용을 확인해주세요.');
  });

  test('화면을 떠나면 편집 모드가 꺼졌다고 알린다', async () => {
    const onEditModeChange = jest.fn();
    const renderer = await renderLoaded([CAFE], {onEditModeChange});
    await unmount(renderer);
    expect(onEditModeChange).toHaveBeenLastCalledWith(false);
  });
});

describe('링크 저장', () => {
  test('바로 완료되면 대화상자를 닫고 다시 읽으며, 완료 표시는 1.8초 뒤 꺼져 다음 완료에도 다시 읽는다', async () => {
    jest.mocked(saveContent).mockResolvedValue({reelId: '8', status: 'COMPLETED', reused: true});
    const renderer = await renderLoaded([CAFE]);
    await pressLabel(renderer, '장소 링크 추가');
    expect(dialog(renderer).props.visible).toBe(true);

    await openDialogAndSave(renderer);
    expect(saveContent).toHaveBeenCalledWith(LINK);
    expect(dialog(renderer).props.visible).toBe(false);
    expect(dialog(renderer).props.value).toBe('');
    expect(getSharedSaveState()).toBeNull();
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);

    await tick(1800);
    await openDialogAndSave(renderer);
    expect(getSavedPlaces).toHaveBeenCalledTimes(3);
    expect(getHistoryReels).not.toHaveBeenCalled();
  });

  test('화면이 없는 동안 끝난 링크 저장은 다시 열 때 공유 상태에서 복원해 다시 읽고 비운다', async () => {
    setSharedSaveState({url: LINK, status: 'COMPLETED', source: 'url_input', reel: reelStatus('8', 'COMPLETED')});
    await renderLoaded([CAFE]);
    expect(getSharedSaveState()).toBeNull();
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
    expect(getHistoryReels).not.toHaveBeenCalled();
  });

  test('처리 중 응답이면 공유 상태에 릴스를 남기고, 목록 폴링에서 완료를 보면 비우고 다시 읽는다', async () => {
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('8', 'COMPLETED')));
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    expect(dialog(renderer).props.visible).toBe(false);
    expect(getSharedSaveState()).toMatchObject({
      status: 'PROCESSING',
      source: 'url_input',
      reel: {id: '8'},
    });
    expect(getSavedPlaces).toHaveBeenCalledTimes(1);

    await tick(3000);
    expect(getSharedSaveState()).toBeNull();
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
  });

  test('지원하지 않는 링크면 대화상자에 문구를 보이고 닫지 않으며, 입력을 고치면 문구를 지운다', async () => {
    const message = '지원하지 않는 링크입니다. Instagram 릴스 링크를 입력해주세요.';
    jest
      .mocked(saveContent)
      .mockRejectedValue(new ReelApiError({errorCode: 'REEL400_001', message, field: 'instagramUrl'}));
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer, 'not a link');

    expect(dialog(renderer).props.visible).toBe(true);
    expect(dialog(renderer).props.errorMessage).toBe(message);
    expect(dialog(renderer).props.isSubmitting).toBe(false);
    // 서버 릴스가 없는 실패라 공유 상태에 지켜볼 저장을 남기지 않는다.
    expect(getSharedSaveState()).toBeNull();

    await act(async () => dialog(renderer).props.onChangeValue(LINK));
    expect(dialog(renderer).props.errorMessage).toBeNull();

    await act(async () => dialog(renderer).props.onClose());
    expect(dialog(renderer).props.visible).toBe(false);
    expect(dialog(renderer).props.value).toBe('');
  });

  test('저장 API가 실패하면 서버 문구를 보인다', async () => {
    jest.mocked(saveContent).mockRejectedValue(
      new ReelApiError({errorCode: 'COMMON500_001', message: '서버가 잠시 불안정해요.', retryable: true}),
    );
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    expect(dialog(renderer).props.errorMessage).toBe('서버가 잠시 불안정해요.');
    expect(dialog(renderer).props.visible).toBe(true);
  });

  test('저장 API가 AUTH401_001이면 대화상자를 닫고 로그인을 요청한다', async () => {
    const onRequireLogin = jest.fn();
    jest
      .mocked(saveContent)
      .mockRejectedValue(new ReelApiError({errorCode: 'AUTH401_001', message: '로그인이 필요해요.'}));
    const renderer = await renderLoaded([CAFE], {onRequireLogin});
    await openDialogAndSave(renderer);
    expect(dialog(renderer).props.visible).toBe(false);
    expect(dialog(renderer).props.errorMessage).toBeNull();
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
  });

  test('저장 중에는 입력을 고쳐도 보내는 중을 유지하고, 다시 저장하거나 대화상자를 닫지 않는다', async () => {
    const request = deferred<Awaited<ReturnType<typeof saveContent>>>();
    jest.mocked(saveContent).mockReturnValue(request.promise);
    const renderer = await renderLoaded([CAFE]);
    await pressLabel(renderer, '장소 링크 추가');
    await act(async () => dialog(renderer).props.onChangeValue(LINK));
    await act(async () => {
      dialog(renderer).props.onSubmit();
    });
    expect(dialog(renderer).props.isSubmitting).toBe(true);
    await act(async () => dialog(renderer).props.onChangeValue(`${LINK}?igsh=1`));
    expect(dialog(renderer).props.isSubmitting).toBe(true);

    await act(async () => {
      dialog(renderer).props.onSubmit();
      dialog(renderer).props.onClose();
    });
    expect(saveContent).toHaveBeenCalledTimes(1);
    expect(dialog(renderer).props.visible).toBe(true);

    await act(async () => request.resolve({reelId: '8', status: 'COMPLETED', reused: true}));
    await flush();
    expect(dialog(renderer).props.visible).toBe(false);
  });

  test('목록에 처리 중인 릴스가 세 번 연달아 없으면 폴링을 멈춘다', async () => {
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    await tick(2999);
    expect(getHistoryReels).not.toHaveBeenCalled();
    await tick(1);
    await tick(3000);
    await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(3);

    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(3);
  });

  test('목록에서 릴스를 찾으면 앞서 놓친 횟수를 잊는다', async () => {
    jest
      .mocked(getHistoryReels)
      .mockResolvedValueOnce(listing())
      .mockResolvedValueOnce(listing())
      .mockResolvedValueOnce(listing(historyReel('8', 'PROCESSING')))
      .mockResolvedValueOnce(listing())
      .mockResolvedValueOnce(listing())
      .mockResolvedValue(listing(historyReel('8', 'COMPLETED')));
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    for (let i = 0; i < 6; i += 1) await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(6);
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['다시 시도할 수 없는 오류', {errorCode: 'COMMON400_001', message: '요청 오류', retryable: false}],
    ['AUTH403_001', {errorCode: 'AUTH403_001', message: '권한 없음', retryable: true}],
  ])('폴링이 %s로 실패하면 바로 멈춘다', async (_, error) => {
    const onRequireLogin = jest.fn();
    jest.mocked(getHistoryReels).mockRejectedValue(new ReelApiError(error));
    const renderer = await renderLoaded([CAFE], {onRequireLogin});
    await openDialogAndSave(renderer);
    await tick(3000);
    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
    expect(onRequireLogin).not.toHaveBeenCalled();
  });

  test('저장 응답이 실패면 폴링하지 않는다', async () => {
    jest.mocked(saveContent).mockResolvedValue({reelId: '8', status: 'FAILED', reused: false});
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    expect(dialog(renderer).props.visible).toBe(false);
    await tick(9000);
    expect(getHistoryReels).not.toHaveBeenCalled();
  });

  test('폴링 중에 목록 오류가 바뀌어도 첫 목록 조회는 저장 3초 뒤에 그대로 나간다', async () => {
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('8', 'PROCESSING')));
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    await tick(1500);
    jest.mocked(getSavedPlaces).mockRejectedValueOnce(SERVER_ERROR);
    await act(async () => refreshControl(renderer).props.onRefresh());
    await flush();
    expect(texts(renderer)).toContain(SERVER_ERROR.message);

    await tick(1499);
    expect(getHistoryReels).not.toHaveBeenCalled();
    await tick(1);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
  });

  test('목록을 받은 뒤 찾다가 예외가 나도 조회 실패로 세어 바로 멈춘다', async () => {
    // 목록 모양이 깨지면 find가 TypeError를 던지고, 다시 시도할 수 없는 오류로 바뀐다.
    jest
      .mocked(getHistoryReels)
      .mockResolvedValue({reels: null as unknown as HistoryReel[], nextCursor: null});
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    await tick(3000);
    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
  });

  test('폴링이 AUTH401_001로 실패하면 바로 멈추고 로그인을 요청한다', async () => {
    const onRequireLogin = jest.fn();
    jest
      .mocked(getHistoryReels)
      .mockRejectedValue(new ReelApiError({errorCode: 'AUTH401_001', message: '로그인이 필요해요.'}));
    const renderer = await renderLoaded([CAFE], {onRequireLogin});
    await openDialogAndSave(renderer);
    await tick(3000);
    expect(onRequireLogin).toHaveBeenCalledTimes(1);

    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
  });

  test('저장한 지 90초가 지나도 처리 중이면 폴링을 멈춘다', async () => {
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('8', 'PROCESSING')));
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    for (let i = 0; i < 30; i += 1) await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(30);

    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(30);
  });

  test('폴링 중에 새 링크를 저장하면 90초를 새 저장부터 센다', async () => {
    jest
      .mocked(getHistoryReels)
      .mockResolvedValue(
        listing(
          historyReel('8', 'PROCESSING'),
          historyReel('9', 'PROCESSING', '2026-10-16T09:01:00Z'),
        ),
      );
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    for (let i = 0; i < 20; i += 1) await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(20);

    jest.mocked(saveContent).mockResolvedValue({reelId: '9', status: 'PROCESSING', reused: false});
    await openDialogAndSave(renderer);
    for (let i = 0; i < 30; i += 1) await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(50);

    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(50);
  });

  test('저장 응답이 6초 걸려도 응답한 릴스는 목록에서 세 번 놓쳐야 폴링을 멈춘다', async () => {
    const request = deferred<Awaited<ReturnType<typeof saveContent>>>();
    jest.mocked(saveContent).mockReturnValue(request.promise);
    const renderer = await renderLoaded([CAFE]);
    await pressLabel(renderer, '장소 링크 추가');
    await act(async () => dialog(renderer).props.onChangeValue(LINK));
    await act(async () => {
      dialog(renderer).props.onSubmit();
    });
    await tick(3000);
    await tick(3000);

    // 응답 뒤의 목록 조회만 센다.
    jest.mocked(getHistoryReels).mockClear();
    await act(async () => request.resolve({reelId: '8', status: 'PROCESSING', reused: false}));
    await flush();
    for (let i = 0; i < 6; i += 1) await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(3);
  });

  test('저장 응답을 기다리는 동안에는 공유 목록을 조회하지 않고, 응답한 릴스는 3초 뒤부터 폴링한다', async () => {
    const request = deferred<Awaited<ReturnType<typeof saveContent>>>();
    jest.mocked(saveContent).mockReturnValue(request.promise);
    const renderer = await renderLoaded([CAFE]);
    await pressLabel(renderer, '장소 링크 추가');
    await act(async () => dialog(renderer).props.onChangeValue(LINK));
    await act(async () => {
      dialog(renderer).props.onSubmit();
    });
    await tick(9000);
    expect(getHistoryReels).not.toHaveBeenCalled();
    expect(getSharedSaveState()).toBeNull();

    await act(async () => request.resolve({reelId: '8', status: 'PROCESSING', reused: false}));
    await flush();
    await tick(2999);
    expect(getHistoryReels).not.toHaveBeenCalled();
    await tick(1);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
  });
});

describe('외부 공유 결과', () => {
  test('완료된 공유가 오면 보관함을 읽고 0.7초 뒤 한 번 더 읽은 다음 공유 결과를 소비한다', async () => {
    const onSharedResultConsumed = jest.fn(() => Promise.resolve());
    const renderer = await renderLoaded([CAFE], {onSharedResultConsumed});
    jest.mocked(getSavedPlaces).mockResolvedValue([CAFE, BAKERY]);

    await act(async () => setSharedSaveState(sharedShare(reelStatus('8', 'COMPLETED'))));
    await flush();
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
    expect(getSharedSaveState()).toBeNull();
    expect(onSharedResultConsumed).not.toHaveBeenCalled();

    await tick(699);
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(getSavedPlaces).toHaveBeenCalledTimes(3);
    expect(onSharedResultConsumed).toHaveBeenCalledWith('request-1');
    expect(placeNames(renderer)).toEqual(['카페', '빵집']);
  });

  test('완료된 공유 뒤 첫 다시 읽기가 실패하면 더 읽지 않고 공유 결과도 소비하지 않는다', async () => {
    const onSharedResultConsumed = jest.fn(() => Promise.resolve());
    await renderLoaded([CAFE], {onSharedResultConsumed});
    jest.mocked(getSavedPlaces).mockRejectedValueOnce(SERVER_ERROR);

    await act(async () => setSharedSaveState(sharedShare(reelStatus('8', 'COMPLETED'))));
    await flush();
    await tick(700);
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
    expect(onSharedResultConsumed).not.toHaveBeenCalled();
  });

  test('앱 진입 때 받은 처리 중 공유는 상태를 한 번 확인한 뒤 목록 폴링으로 지켜보고, 완료되면 소비한다', async () => {
    const onSharedResultConsumed = jest.fn(() => Promise.resolve());
    // 공유 익스텐션이 남긴 시각과 서버 시각이 달라도 확인은 한 번만 한다.
    setSharedSaveState(sharedShare(reelStatus('8', 'PROCESSING', '2026-10-16T08:59:59Z')));
    jest.mocked(getReelProcessingStatus).mockResolvedValue(reelStatus('8', 'PROCESSING'));
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('8', 'COMPLETED')));

    await renderLoaded([CAFE], {onSharedResultConsumed});
    expect(getReelProcessingStatus).toHaveBeenCalledTimes(1);
    expect(getReelProcessingStatus).toHaveBeenCalledWith('8');
    expect(jest.mocked(getSavedPlaces).mock.invocationCallOrder[0]).toBeLessThan(
      jest.mocked(getReelProcessingStatus).mock.invocationCallOrder[0],
    );
    expect(getSharedSaveState()).toMatchObject({status: 'PROCESSING', reel: {id: '8'}});

    await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
    expect(getSharedSaveState()).toBeNull();
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);

    await tick(700);
    expect(getSavedPlaces).toHaveBeenCalledTimes(3);
    expect(onSharedResultConsumed).toHaveBeenCalledWith('request-1');

    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
  });

  test('확인한 공유가 목록에 없으면 공유 상태를 지우고 결과를 소비하며 폴링하지 않는다', async () => {
    const onSharedResultConsumed = jest.fn(() => Promise.resolve());
    setSharedSaveState(sharedShare(reelStatus('8', 'PROCESSING')));

    await renderLoaded([CAFE], {onSharedResultConsumed});
    expect(getSharedSaveState()).toBeNull();
    expect(onSharedResultConsumed).toHaveBeenCalledWith('request-1');

    await tick(3000);
    expect(getHistoryReels).not.toHaveBeenCalled();
  });

  test('reelId가 오기 전의 공유는 상태를 묻지 않고 기다린다', async () => {
    setSharedSaveState(sharedShare(reelStatus('share-1', 'PENDING')));
    await renderLoaded([CAFE]);
    await tick(3000);
    expect(getReelProcessingStatus).not.toHaveBeenCalled();
    expect(getHistoryReels).not.toHaveBeenCalled();
    expect(getSharedSaveState()).toMatchObject({status: 'PENDING'});
  });

  test('처리 중인 공유가 만들어진 지 90초가 지났으면 첫 목록 조회 뒤 폴링을 멈춘다', async () => {
    setSharedSaveState(sharedShare(reelStatus('8', 'PROCESSING')));
    jest
      .mocked(getReelProcessingStatus)
      .mockResolvedValue(reelStatus('8', 'PROCESSING', '2026-10-16T08:58:00Z'));
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('8', 'PROCESSING')));

    await renderLoaded([CAFE]);
    await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);

    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
  });
});

describe('최근 검색', () => {
  test('저장된 최근 검색어를 10개까지 읽어 검색 패널에 넘기고 그대로 다시 저장한다', async () => {
    const stored = Array.from({length: 12}, (_, index) => `검색 ${index + 1}`);
    jest.mocked(getRecentSearches).mockResolvedValue(stored);
    const renderer = await renderLoaded([CAFE]);

    await act(async () => header(renderer).props.onPressSearch());
    expect(searchPanel(renderer).props.recentSearches).toEqual(stored.slice(0, 10));
    expect(setRecentSearches).toHaveBeenCalledTimes(1);
    expect(setRecentSearches).toHaveBeenCalledWith(stored.slice(0, 10));

    await act(async () => searchPanel(renderer).props.onCloseSearch());
    expect(renderer.root.findAllByType(SavedPlacesSearchPanel)).toHaveLength(0);
  });

  test('검색어를 저장하면 공백을 지우고 중복을 맨 앞으로 옮기며 10개만 남기고, 빈 검색어는 무시한다', async () => {
    const stored = Array.from({length: 10}, (_, index) => `${index + 1}`);
    jest.mocked(getRecentSearches).mockResolvedValue(stored);
    const renderer = await renderLoaded([CAFE]);
    await act(async () => header(renderer).props.onPressSearch());

    await act(async () => searchPanel(renderer).props.onSaveSearchTerm(' 5 '));
    expect(searchPanel(renderer).props.recentSearches).toEqual(
      ['5', '1', '2', '3', '4', '6', '7', '8', '9', '10'],
    );

    await act(async () => searchPanel(renderer).props.onSaveSearchTerm('새 검색어'));
    const latest = ['새 검색어', '5', '1', '2', '3', '4', '6', '7', '8', '9'];
    expect(searchPanel(renderer).props.recentSearches).toEqual(latest);

    await act(async () => searchPanel(renderer).props.onSaveSearchTerm('   '));
    expect(searchPanel(renderer).props.recentSearches).toEqual(latest);
    expect(setRecentSearches).toHaveBeenLastCalledWith(latest);
  });
});

describe('비회원', () => {
  test('넘겨받은 장소를 그리고 목록 API를 부르지 않으며, 장소를 누르면 이벤트 없이 상세를 연다', async () => {
    const onOpenDetail = jest.fn();
    const renderer = await render({isGuest: true, places: GUEST_PLACES, onOpenDetail});
    expect(placeNames(renderer)).toEqual(['체험 카페', '체험 빵집']);
    expect(getSavedPlaces).not.toHaveBeenCalled();

    await act(async () => grid(renderer).props.onPressPlace(GUEST_PLACES[0], 1));
    expect(onOpenDetail).toHaveBeenCalledWith(GUEST_PLACES[0]);
    expect(captureSavedPlaceSelected).not.toHaveBeenCalled();
  });

  test('고른 장소를 지우면 API 대신 onDeleteGuestPlaces로 넘기고 편집을 끝낸다', async () => {
    const onDeleteGuestPlaces = jest.fn();
    const onEditModeChange = jest.fn();
    const renderer = await render({
      isGuest: true,
      places: GUEST_PLACES,
      onDeleteGuestPlaces,
      onEditModeChange,
    });
    await selectAndDelete(renderer, 'guest-1');

    expect(onDeleteGuestPlaces).toHaveBeenCalledWith(['guest-1']);
    expect(deleteSavedPlaces).not.toHaveBeenCalled();
    expect(placeNames(renderer)).toEqual(['체험 빵집']);
    expect(grid(renderer).props.isEditing).toBe(false);
    expect(onEditModeChange).toHaveBeenLastCalledWith(false);
  });

  test('링크 추가를 누르면 대화상자 대신 로그인을 요청하고, 공유 상태는 건드리지 않는다', async () => {
    const onRequireLogin = jest.fn();
    setSharedSaveState(sharedShare(reelStatus('8', 'COMPLETED')));
    const renderer = await render({isGuest: true, places: GUEST_PLACES, onRequireLogin});

    await pressLabel(renderer, '장소 링크 추가');
    expect(onRequireLogin).toHaveBeenCalledTimes(1);
    expect(dialog(renderer).props.visible).toBe(false);
    expect(getSharedSaveState()).toMatchObject({status: 'COMPLETED'});
  });
});

describe('이벤트와 스크롤', () => {
  test('목록을 처음 그리면 조회 이벤트를 한 번 보내고, 장소를 누르면 선택 이벤트와 함께 상세를 연다', async () => {
    const onOpenDetail = jest.fn();
    const renderer = await renderLoaded([CAFE, BAKERY], {onOpenDetail});
    expect(captureSavedPlacesViewed).toHaveBeenCalledTimes(1);
    expect(captureSavedPlacesViewed).toHaveBeenCalledWith(mockPostHog, {
      placeCount: 2,
      entryType: 'direct',
    });

    const bakery = placeNamed(renderer, '빵집');
    await act(async () => grid(renderer).props.onPressPlace(bakery, 2));
    const context = {
      placeId: 'place-2',
      savedPlaceId: 'saved-2',
      placeViewId: 'test-uuid',
      source: 'saved_places_grid',
    };
    expect(captureSavedPlaceSelected).toHaveBeenLastCalledWith(mockPostHog, {...context, position: 2});
    expect(onOpenDetail).toHaveBeenLastCalledWith(bakery, context);

    const refresh = deferred<SavedPlaceListItem[]>();
    jest.mocked(getSavedPlaces).mockReturnValueOnce(refresh.promise);
    await act(async () => {
      refreshControl(renderer).props.onRefresh();
    });
    await act(async () => refresh.resolve([CAFE]));
    await flush();
    expect(captureSavedPlacesViewed).toHaveBeenCalledTimes(1);
  });

  test('검색 결과에서 장소를 누르면 검색 ID와 순서를 함께 보낸다', async () => {
    const renderer = await renderLoaded([CAFE, BAKERY]);
    const bakery = placeNamed(renderer, '빵집');
    await act(async () => header(renderer).props.onPressSearch());
    await act(async () =>
      searchPanel(renderer).props.onPressPlace(bakery, {searchId: 'search-1', position: 1}),
    );
    expect(captureSavedPlaceSelected).toHaveBeenLastCalledWith(mockPostHog, {
      placeId: 'place-2',
      savedPlaceId: 'saved-2',
      placeViewId: 'test-uuid',
      source: 'saved_places_search',
      searchId: 'search-1',
      position: 1,
    });
  });

  test('저장해 둔 스크롤 위치가 있으면 목록을 그린 뒤 그 위치로 옮기고, 맨 위 버튼은 위로 올린다', async () => {
    const renderer = await renderLoaded([CAFE], {initialScrollOffset: 120});
    await tick(0);
    const scrollTo = jest.mocked(renderer.root.findByType(ScrollView).instance.scrollTo);
    expect(scrollTo).toHaveBeenCalledWith({y: 120, animated: false});

    await pressAround(renderer, props => props.name === 'upload');
    expect(scrollTo).toHaveBeenLastCalledWith({y: 0, animated: true});
  });
});
