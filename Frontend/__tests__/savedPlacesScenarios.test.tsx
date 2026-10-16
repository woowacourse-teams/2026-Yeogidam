import React from 'react';

import {getReelProcessingStatus, saveContent} from '../src/entities/content/api';
import {ReelApiError} from '../src/entities/content/errors';
import {getHistoryReels} from '../src/entities/content/history-api';
import type {HistoryReel, ReelProcessingStatus} from '../src/entities/content/types';
import {getSavedPlaces} from '../src/entities/info/api';
import type {SavedPlaceListItem} from '../src/entities/info/types';
import {getSharedSaveState, setSharedSaveState} from '../src/lib/reel-save-state';
import {SavedPlacesEmptyState} from '../src/pages/saved-places/components/SavedPlacesEmptyState';
import {SavedPlacesSkeleton} from '../src/pages/saved-places/components/SavedPlacesSkeleton';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';
import {deferred} from './support/deferred';
import {
  BAKERY,
  CAFE,
  historyReel,
  LINK,
  listing,
  reelStatus,
  SERVER_ERROR,
  sharedShare,
} from './support/savedPlacesFixtures';
import {
  act,
  flush,
  openDialogAndSave,
  placeNames,
  refreshControl,
  render,
  renderLoaded,
  setUpSavedPlacesScreenTests,
  texts,
  tick,
  unmount,
} from './support/savedPlacesHarness';

// 보관함 화면에서 조회, 링크 저장, 폴링, 외부 공유 확인이 겹치는 순서를 고정한다.
// 지금 동작을 그대로 적은 것이라, 훅의 TODO(review)를 고칠 때는 해당 테스트를 함께 뒤집는다.

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

describe('보관함 화면의 겹치는 순서', () => {
  test('늦게 실패한 이전 조회는 새 목록과 오류 표시, 새로고침 표시를 바꾸지 않는다', async () => {
    await unmount(await renderLoaded([CAFE]));
    const mountLoad = deferred<SavedPlaceListItem[]>();
    const refreshLoad = deferred<SavedPlaceListItem[]>();
    jest.mocked(getSavedPlaces).mockReturnValueOnce(mountLoad.promise).mockReturnValueOnce(refreshLoad.promise);
    const renderer = await render();
    await act(async () => {
      refreshControl(renderer).props.onRefresh();
    });
    expect(refreshControl(renderer).props.refreshing).toBe(true);
    await act(async () => refreshLoad.resolve([CAFE, BAKERY]));
    await flush();
    expect(refreshControl(renderer).props.refreshing).toBe(false);
    await act(async () => mountLoad.reject(SERVER_ERROR));
    await flush();
    expect(texts(renderer)).not.toContain(SERVER_ERROR.message);
    expect(placeNames(renderer)).toEqual(['카페', '빵집']);
  });

  test('캐시 없이 두 조회가 겹치면 먼저 끝난 이전 응답은 스켈레톤을 내리지 않는다', async () => {
    const mountLoad = deferred<SavedPlaceListItem[]>();
    const successLoad = deferred<SavedPlaceListItem[]>();
    jest.mocked(getSavedPlaces).mockReturnValueOnce(mountLoad.promise).mockReturnValueOnce(successLoad.promise);
    setSharedSaveState({url: LINK, status: 'COMPLETED', source: 'url_input', reel: reelStatus('8', 'COMPLETED')});
    const renderer = await render();
    await flush();
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(1);
    await act(async () => mountLoad.resolve([CAFE]));
    await flush();
    expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(1);
    expect(renderer.root.findAllByType(SavedPlacesEmptyState)).toHaveLength(0);
    await act(async () => successLoad.resolve([CAFE, BAKERY]));
    await flush();
    expect(placeNames(renderer)).toEqual(['카페', '빵집']);
  });

  test('확인 중에 화면을 떠나면 확인 결과로 공유 상태를 바꾸지 않고 소비하지 않는다', async () => {
    const status = deferred<ReelProcessingStatus | null>();
    jest.mocked(getReelProcessingStatus).mockReturnValue(status.promise);
    const share = sharedShare(reelStatus('8', 'PROCESSING'));
    setSharedSaveState(share);
    const onSharedResultConsumed = jest.fn(() => Promise.resolve());
    const renderer = await renderLoaded([CAFE], {onSharedResultConsumed});
    expect(getReelProcessingStatus).toHaveBeenCalledTimes(1);
    await unmount(renderer);
    await act(async () => status.resolve(null));
    await flush();
    expect(getSharedSaveState()).toBe(share);
    expect(onSharedResultConsumed).not.toHaveBeenCalled();
  });

  test('링크 저장을 폴링하는 중에 외부 공유가 오면 링크 폴링을 멈추고, 공유가 reelId를 받으면 확인 뒤 그 공유를 폴링한다', async () => {
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('8', 'PROCESSING')));
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
    await act(async () => setSharedSaveState(sharedShare(reelStatus('share-1', 'PENDING'))));
    await tick(9000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
    jest.mocked(getReelProcessingStatus).mockResolvedValue(reelStatus('9', 'PROCESSING'));
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('9', 'COMPLETED')));
    await act(async () => setSharedSaveState(sharedShare(reelStatus('9', 'PROCESSING'))));
    await flush();
    expect(getReelProcessingStatus).toHaveBeenCalledWith('9');
    await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(2);
    expect(getSharedSaveState()).toBeNull();
    expect(getSavedPlaces).toHaveBeenCalledTimes(2);
  });

  test('앞 폴링이 90초로 멈춘 뒤 새 링크를 저장하면 90초를 새로 센다', async () => {
    jest.mocked(getHistoryReels).mockResolvedValue(
      listing(historyReel('8', 'PROCESSING'), historyReel('9', 'PROCESSING', '2026-10-16T09:02:00Z')),
    );
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    for (let i = 0; i < 31; i += 1) await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(30);
    jest.mocked(saveContent).mockResolvedValue({reelId: '9', status: 'PROCESSING', reused: false});
    await openDialogAndSave(renderer);
    for (let i = 0; i < 10; i += 1) await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(40);
  });

  test('폴링 중에 onRequireLogin 참조가 바뀌면 다음 목록 조회가 그때부터 3초 뒤로 밀린다', async () => {
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('8', 'PROCESSING')));
    const onOpenDetail = jest.fn();
    const renderer = await renderLoaded([CAFE], {onOpenDetail, onRequireLogin: () => undefined});
    await openDialogAndSave(renderer);
    await tick(1500);
    await act(async () =>
      renderer.update(<SavedPlacesScreen onOpenDetail={onOpenDetail} onRequireLogin={() => undefined} />),
    );
    await tick(1500);
    expect(getHistoryReels).not.toHaveBeenCalled();
    await tick(1500);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
  });

  test('외부 공유를 확인하는 사이 링크 저장이 응답하면 확인 결과가 링크 저장 상태를 덮고 그 릴스는 폴링하지 않는다', async () => {
    const status = deferred<ReelProcessingStatus | null>();
    jest.mocked(getReelProcessingStatus).mockReturnValue(status.promise);
    setSharedSaveState(sharedShare(reelStatus('8', 'PROCESSING')));
    const renderer = await renderLoaded([CAFE]);
    jest.mocked(saveContent).mockResolvedValue({reelId: '9', status: 'PROCESSING', reused: false});
    await openDialogAndSave(renderer);
    expect(getSharedSaveState()).toMatchObject({source: 'url_input', reel: {id: '9'}});
    await act(async () => status.resolve(reelStatus('8', 'PROCESSING')));
    await flush();
    expect(getSharedSaveState()).toMatchObject({source: 'instagram_share', reel: {id: '8'}});
    jest.mocked(getHistoryReels).mockResolvedValue(listing(historyReel('9', 'COMPLETED')));
    for (let i = 0; i < 4; i += 1) await tick(3000);
    expect(getSavedPlaces).toHaveBeenCalledTimes(1);
    expect(getHistoryReels).toHaveBeenCalledTimes(3);
  });

  test('앞 릴스 목록 조회가 끝나기 전에 새 링크를 저장하면 그 응답은 새 릴스 기준으로만 읽힌다', async () => {
    const fetch1 = deferred<{reels: HistoryReel[]; nextCursor: null}>();
    jest
      .mocked(getHistoryReels)
      .mockReturnValueOnce(fetch1.promise as ReturnType<typeof getHistoryReels>)
      .mockResolvedValue(listing(historyReel('9', 'PROCESSING')));
    const renderer = await renderLoaded([CAFE]);
    await openDialogAndSave(renderer);
    await tick(3000);
    expect(getHistoryReels).toHaveBeenCalledTimes(1);
    jest.mocked(saveContent).mockResolvedValue({reelId: '9', status: 'PROCESSING', reused: false});
    await openDialogAndSave(renderer);
    await act(async () => fetch1.resolve(listing(historyReel('8', 'COMPLETED'))));
    await flush();
    expect(getSavedPlaces).toHaveBeenCalledTimes(1);
    expect(getSharedSaveState()).toMatchObject({reel: {id: '9'}, status: 'PROCESSING'});
  });

  test('폴링 중 로그인이 필요해지면 멈춘 뒤 로그인을 요청하고, 공유 상태는 처리 중으로 남는다', async () => {
    const calls: string[] = [];
    jest.mocked(getHistoryReels).mockImplementation(async () => {
      calls.push('fetch');
      throw new ReelApiError({errorCode: 'AUTH401_001', message: '로그인이 필요해요.'});
    });
    const onRequireLogin = jest.fn(() => calls.push('login'));
    const renderer = await renderLoaded([CAFE], {onRequireLogin});
    await openDialogAndSave(renderer);
    await tick(3000);
    await tick(9000);
    expect(calls).toEqual(['fetch', 'login']);
    expect(getSharedSaveState()).toMatchObject({status: 'PROCESSING', reel: {id: '8'}});
  });
});
