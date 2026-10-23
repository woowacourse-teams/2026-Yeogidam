import React from 'react';

import {getReelProcessingStatus, saveContent} from '../src/entities/content/api';
import {ReelApiError} from '../src/entities/content/errors';
import {getHistoryReels} from '../src/entities/content/history-api';
import {getSavedPlaces} from '../src/entities/info/api';
import {SavedPlacesScreen} from '../src/pages/saved-places/SavedPlacesScreen';
import {historyReel, LINK, listing} from './support/savedPlacesFixtures';
import {
  act,
  openDialogAndSave,
  render,
  setUpSavedPlacesScreenTests,
  tick,
} from './support/savedPlacesHarness';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
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

test('링크 저장 뒤 처리 상태는 공용 목록 폴링으로 확인하고, 완료되면 보관함을 다시 읽고 폴링을 멈춘다', async () => {
  jest
    .mocked(getHistoryReels)
    .mockResolvedValueOnce(listing(historyReel('8', 'PROCESSING')))
    .mockResolvedValue(listing(historyReel('8', 'COMPLETED')));
  const renderer = await render();
  const savedPlacesCallsBefore = jest.mocked(getSavedPlaces).mock.calls.length;

  await openDialogAndSave(renderer);
  expect(saveContent).toHaveBeenCalledWith(LINK);

  // 아직 처리 중이면 보관함을 다시 읽지 않는다.
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(1);
  expect(getHistoryReels).toHaveBeenCalledWith();
  expect(getSavedPlaces).toHaveBeenCalledTimes(savedPlacesCallsBefore);

  // 완료되면 저장된 장소를 바로 반영한다.
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  expect(jest.mocked(getSavedPlaces).mock.calls.length).toBeGreaterThan(savedPlacesCallsBefore);

  // 완료 뒤에는 이 화면이 구독을 끝내 더 읽지 않는다.
  await tick(9000);
  expect(getHistoryReels).toHaveBeenCalledTimes(2);
  // 상태 확인은 단건 조회 없이 목록 폴링으로만 한다.
  expect(getReelProcessingStatus).not.toHaveBeenCalledWith('8');
});

test('목록 조회가 연속으로 실패하면 세 번째에 처리 상태 확인을 멈춘다', async () => {
  // 실제 네트워크 실패는 다시 시도할 수 있는 ReelApiError로 온다.
  jest.mocked(getHistoryReels).mockRejectedValue(
    new ReelApiError({
      errorCode: 'CLIENT000_001',
      message: '인터넷 연결을 확인해주세요.',
      retryable: true,
    }),
  );
  const renderer = await render();

  await openDialogAndSave(renderer);
  await tick(3000);
  await tick(3000);
  await tick(3000);
  expect(getHistoryReels).toHaveBeenCalledTimes(3);

  await tick(9000);
  expect(getHistoryReels).toHaveBeenCalledTimes(3);
});

test('빈 보관함에 복귀할 때 조회가 진행되거나 실패해도 기존 빈 화면을 유지한다', async () => {
  const {SavedPlacesSkeleton} = require('../src/pages/saved-places/components/SavedPlacesSkeleton');
  const {SavedPlacesEmptyState} = require('../src/pages/saved-places/components/SavedPlacesEmptyState');
  const {SavedPlacesErrorState} = require('../src/pages/saved-places/components/SavedPlacesErrorState');
  const renderer = await render();
  const onOpenDetail = renderer.root.findByType(SavedPlacesScreen).props.onOpenDetail;
  await act(async () => {
    renderer.update(<SavedPlacesScreen isActive={false} onOpenDetail={onOpenDetail} />);
  });
  let rejectQuery!: (error: unknown) => void;
  jest.mocked(getSavedPlaces).mockImplementationOnce(() => new Promise((_, reject) => { rejectQuery = reject; }));
  await act(async () => {
    renderer.update(<SavedPlacesScreen isActive onOpenDetail={onOpenDetail} />);
  });
  expect(renderer.root.findAllByType(SavedPlacesSkeleton)).toHaveLength(0);
  expect(renderer.root.findAllByType(SavedPlacesEmptyState)).toHaveLength(1);
  await act(async () => {
    rejectQuery({status: 500, errorCode: 'SERVER500_001', message: '일시적인 오류', retryable: true});
  });
  expect(renderer.root.findAllByType(SavedPlacesEmptyState)).toHaveLength(1);
  expect(renderer.root.findAllByType(SavedPlacesErrorState)).toHaveLength(0);
});
