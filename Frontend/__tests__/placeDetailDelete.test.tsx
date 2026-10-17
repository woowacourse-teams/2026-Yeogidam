import React, {StrictMode} from 'react';
import {Alert} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {deleteSavedPlaces, getPlaceReels, getSavedPlaces} from '../src/entities/info/api';
import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import type {Place} from '../src/entities/place/types';
import {PlaceDetailActionSheet} from '../src/pages/place-detail/components/PlaceDetailActionSheet';
import {PlaceDetailContent} from '../src/pages/place-detail/components/PlaceDetailContent';
import {PlaceDetailScreen} from '../src/pages/place-detail/PlaceDetailScreen';
import {cachedPlaceNames} from './support/cachedPlaceNames';
import {deferred} from './support/deferred';
import {renderTracked, settleAsyncWork, type Renderer} from './support/renderers';
import {
  AUTH_ERROR,
  BAKERY,
  CACHED_BAKERY,
  CACHED_CAFE,
  CACHED_PLACES,
  CAFE,
  SERVER_ERROR,
  TIMEOUT_ERROR,
} from './support/savedPlacesFixtures';

// 상세 화면에서 저장 장소를 지우는 흐름을 확인합니다. 지우고 확인하고 캐시에서 빼는 규칙은 savedPlaceDeletion.test.ts가 맡으므로,
// 화면이 맡은 일(돌아가기, 삭제 시트의 오류와 지우는 중 표시, 로그인 요청, 지우는 동안 막기)과 캐시에 남은 장소만 확인합니다.

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0}),
}));
jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('../src/entities/info/api', () => ({
  deleteSavedPlaces: jest.fn(),
  getPlaceReels: jest.fn(),
  getSavedPlaces: jest.fn(),
}));
jest.mock('../src/pages/place-detail/components/CopyToast', () => ({
  CopyToastProvider: ({children}: {children: React.ReactNode}) => children,
}));
// 상세 본문과 삭제 시트는 그리지 않고, 화면이 넘긴 props(더 보기, 닫기, 삭제 콜백과 시트 상태)만 씁니다.
jest.mock('../src/pages/place-detail/components/PlaceDetailContent', () => ({
  PlaceDetailContent: () => null,
}));
jest.mock('../src/pages/place-detail/components/PlaceDetailActionSheet', () => ({
  PlaceDetailActionSheet: () => null,
}));

const act = ReactTestRenderer.act;
let alertSpy: jest.SpyInstance;

type DetailCallbacks = {onBack: jest.Mock; onAuthenticationRequired: jest.Mock};

/**
 * 회원의 상세 화면을 그립니다. App이 넘기는 onBack(closeDetail)은 그때 보이는 상세를 조건 없이 닫으므로, 불린 횟수로 상세를 닫았는지 봅니다.
 * 상세 화면이 내려간 뒤 새 화면을 그릴 때는 App처럼 앞 화면과 같은 콜백을 넘깁니다.
 */
async function renderDetail(
  target: Place,
  {onBack, onAuthenticationRequired}: DetailCallbacks = {onBack: jest.fn(), onAuthenticationRequired: jest.fn()},
) {
  const detailOf = (place: Place) => (
    <PlaceDetailScreen onBack={onBack} onAuthenticationRequired={onAuthenticationRequired} place={place} />
  );
  const renderer = await renderTracked(detailOf(target));
  return {
    renderer,
    onBack,
    onAuthenticationRequired,
    /** App이 같은 상세 화면에 다른 장소를 넘겨 다시 그리는 일을 흉내 냅니다. */
    showPlace: (place: Place) => act(async () => renderer.update(detailOf(place))),
  };
}

/** 상세의 더 보기로 삭제 시트를 엽니다. */
async function openDeleteSheet(renderer: Renderer) {
  await act(async () => renderer.root.findByType(PlaceDetailContent).props.onPressMore());
}

/** 삭제 시트의 바깥을 눌러 닫습니다. 닫기는 지우는 동안에도 막지 않습니다. */
async function closeDeleteSheet(renderer: Renderer) {
  await act(async () => renderer.root.findByType(PlaceDetailActionSheet).props.onClose());
}

/** 삭제 시트의 삭제 버튼을 누릅니다. 지우는 중이 아니면 확인 창이 뜹니다. */
async function pressDeleteButton(renderer: Renderer) {
  await act(async () => renderer.root.findByType(PlaceDetailActionSheet).props.onDelete());
}

/** 삭제 시트의 삭제 버튼을 누르고, 새로 뜬 확인 창의 '삭제'를 누릅니다. */
async function deleteFromSheet(renderer: Renderer) {
  const alertCount = alertSpy.mock.calls.length;
  await pressDeleteButton(renderer);
  // 확인 창이 뜨지 않았는데 앞 확인 창의 '삭제'를 다시 누르면 지난 장소를 또 지우므로 여기서 멈춥니다.
  if (alertSpy.mock.calls.length !== alertCount + 1) {
    throw new Error('삭제 버튼을 눌렀는데 확인 창이 뜨지 않았습니다.');
  }
  const buttons = alertSpy.mock.calls[alertCount][2];
  await act(async () => {
    buttons.find((button: {text: string}) => button.text === '삭제').onPress();
  });
  await settleAsyncWork();
}

/** 삭제 시트가 열렸는지, 지우는 중이라 버튼을 막았는지, 어떤 오류를 보이는지 함께 봅니다. */
function deleteSheetState(renderer: Renderer) {
  const {visible, isDeleting, deleteError} = renderer.root.findByType(PlaceDetailActionSheet).props;
  return {visible, isDeleting, deleteError};
}

/** 카페의 상세 화면을 그려 삭제 시트에서 지우기를 시작하고, 지우는 동안 삭제 시트를 닫습니다. */
async function renderCafeAndStartDeleting() {
  const detail = await renderDetail(CACHED_CAFE);
  await openDeleteSheet(detail.renderer);
  await deleteFromSheet(detail.renderer);
  await closeDeleteSheet(detail.renderer);
  return detail;
}

beforeEach(() => {
  clearSavedPlacesCache();
  writeSavedPlacesCache(CACHED_PLACES, getSavedPlacesCacheGeneration());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.mocked(getPlaceReels).mockResolvedValue([]);
  jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
  jest.mocked(getSavedPlaces).mockReset();
});

afterEach(() => {
  alertSpy.mockRestore();
});

test('상세에서 지우기에 성공하면 보관함 캐시에서도 빼고 돌아간다', async () => {
  const {renderer, onBack} = await renderDetail(CACHED_CAFE);
  await deleteFromSheet(renderer);

  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]]]);
  expect(cachedPlaceNames()).toEqual(['빵집']);
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('삭제 응답이 늦어 실패해도 다시 읽은 목록에 없으면 지운 것으로 보고 캐시에서 뺀다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
  jest.mocked(getSavedPlaces).mockResolvedValue([BAKERY]);
  const {renderer, onBack} = await renderDetail(CACHED_CAFE);
  await deleteFromSheet(renderer);

  expect(cachedPlaceNames()).toEqual(['빵집']);
  expect(onBack).toHaveBeenCalledTimes(1);
});

test.each([
  ['서버 오류로', '요청하지 않는다', SERVER_ERROR, []],
  ['로그인이 필요하다는 서버 응답으로', '요청한다', AUTH_ERROR, [[]]],
])(
  '지우기에 %s 실패하면 캐시를 그대로 두고 돌아가지 않으며 삭제 시트에 받은 오류를 보이고, 로그인은 %s',
  async (_condition, _login, error, expectedLoginRequests) => {
    jest.mocked(deleteSavedPlaces).mockRejectedValue(error);
    const {renderer, onBack, onAuthenticationRequired} = await renderDetail(CACHED_CAFE);
    await openDeleteSheet(renderer);
    await deleteFromSheet(renderer);

    expect(cachedPlaceNames()).toEqual(['카페', '빵집']);
    expect(onBack).not.toHaveBeenCalled();
    expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: false, deleteError: error});
    expect(onAuthenticationRequired.mock.calls).toEqual(expectedLoginRequests);
  },
);

test('지우는 동안에는 삭제 버튼을 막고 다시 눌러도 확인 창을 띄우지 않아 지우기를 한 번만 보내며, 끝나면 삭제 시트를 닫고 돌아간다', async () => {
  const request = deferred<void>();
  jest.mocked(deleteSavedPlaces).mockReturnValueOnce(request.promise);
  const {renderer, onBack} = await renderDetail(CACHED_CAFE);
  await openDeleteSheet(renderer);
  await deleteFromSheet(renderer);
  expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: true, deleteError: null});

  await pressDeleteButton(renderer);
  expect(alertSpy).toHaveBeenCalledTimes(1);
  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]]]);
  expect(onBack).not.toHaveBeenCalled();

  await act(async () => request.resolve());
  await settleAsyncWork();
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(deleteSheetState(renderer)).toEqual({visible: false, isDeleting: false, deleteError: null});
});

test('StrictMode처럼 effect가 다시 돌아도 지우기에 성공하면 삭제 시트를 닫고 돌아간다', async () => {
  const onBack = jest.fn();
  const renderer = await renderTracked(
    <StrictMode>
      <PlaceDetailScreen onBack={onBack} place={CACHED_CAFE} />
    </StrictMode>,
    {unstable_isConcurrent: true} as unknown as ReactTestRenderer.TestRendererOptions,
  );
  await openDeleteSheet(renderer);
  await deleteFromSheet(renderer);

  expect(onBack).toHaveBeenCalledTimes(1);
  expect(deleteSheetState(renderer)).toEqual({visible: false, isDeleting: false, deleteError: null});
});

test('지우는 동안 같은 상세 화면에서 다른 장소를 열었다가 지우던 장소를 다시 열면, 다시 연 장소의 삭제 버튼은 막혀 있고 지우기가 끝나면 삭제 시트를 닫고 돌아간다', async () => {
  const request = deferred<void>();
  jest.mocked(deleteSavedPlaces).mockReturnValueOnce(request.promise);
  const detail = await renderCafeAndStartDeleting();
  await detail.showPlace(CACHED_BAKERY);
  await detail.showPlace(CACHED_CAFE);
  await openDeleteSheet(detail.renderer);
  expect(deleteSheetState(detail.renderer)).toEqual({visible: true, isDeleting: true, deleteError: null});

  await pressDeleteButton(detail.renderer);
  expect(alertSpy).toHaveBeenCalledTimes(1);

  await act(async () => request.resolve());
  await settleAsyncWork();
  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]]]);
  expect(cachedPlaceNames()).toEqual(['빵집']);
  expect(detail.onBack).toHaveBeenCalledTimes(1);
  expect(deleteSheetState(detail.renderer)).toEqual({visible: false, isDeleting: false, deleteError: null});
});

test('지우는 동안 같은 상세 화면에서 다른 장소를 연 사이 지우기가 실패하면, 지우던 장소를 다시 열었을 때 삭제 버튼이 풀려 있어 다시 지울 수 있다', async () => {
  const request = deferred<void>();
  jest.mocked(deleteSavedPlaces).mockReturnValueOnce(request.promise);
  const detail = await renderCafeAndStartDeleting();
  await detail.showPlace(CACHED_BAKERY);
  await act(async () => request.reject(SERVER_ERROR));
  await settleAsyncWork();

  await detail.showPlace(CACHED_CAFE);
  await openDeleteSheet(detail.renderer);
  expect(deleteSheetState(detail.renderer)).toEqual({visible: true, isDeleting: false, deleteError: null});

  await deleteFromSheet(detail.renderer);
  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]], [[CAFE.id]]]);
  expect(cachedPlaceNames()).toEqual(['빵집']);
  expect(detail.onBack).toHaveBeenCalledTimes(1);
});
