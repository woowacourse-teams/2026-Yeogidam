import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {deleteSavedPlaces, getPlaceReels, getSavedPlaces} from '../src/entities/info/api';
import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import {PlaceResultSheet} from '../src/pages/map/components/PlaceResultSheet';
import {PlaceDetailActionSheet} from '../src/pages/place-detail/components/PlaceDetailActionSheet';
import {PlaceDetailContent} from '../src/pages/place-detail/components/PlaceDetailContent';
import {cachedPlaceNames} from './support/cachedPlaceNames';
import {deferred} from './support/deferred';
import {pressLabel} from './support/pressLabel';
import {flushMicrotasks, renderTracked, type Renderer} from './support/renderers';
import {
  AUTH_ERROR,
  BAKERY,
  CACHED_PLACES,
  CAFE,
  GUEST_PLACES,
  SERVER_ERROR,
  TIMEOUT_ERROR,
} from './support/savedPlacesFixtures';

// 지도 결과 시트에서 장소를 지우는 흐름을 확인합니다. 지우고 확인하고 캐시에서 빼는 일은 savedPlaceDeletion.test.ts가 맡으므로,
// 시트가 맡은 일(지도 화면에 알리는 차례, 목록으로 돌아가기, 오류 전달, 로그인 요청, 지우는 동안 막기)만 확인합니다.

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('../src/entities/info/api', () => ({
  deleteSavedPlaces: jest.fn(),
  getPlaceReels: jest.fn(),
  getSavedPlaces: jest.fn(),
}));
// 상세 본문은 장소 정보와 게시물 탭을 그릴 뿐 삭제와 관계가 없어 비웁니다. 시트가 넘긴 더보기 콜백은 props로 부릅니다.
jest.mock('../src/pages/place-detail/components/PlaceDetailContent', () => ({
  PlaceDetailContent: () => null,
}));

const act = ReactTestRenderer.act;
const DELETE_LABEL = '장소 삭제하기';

/** 시트가 지도 화면에 알린 일을 차례로 적습니다. 지운 장소를 알릴 때는 그때 캐시에 남은 이름도 적어, 캐시에서 뺀 뒤에 알렸는지 봅니다. */
type SheetEvent =
  | {detailShown: boolean}
  | {deletedSavedPlaceId: string; cachedNames: string[] | undefined};

async function renderSheet(props: Partial<React.ComponentProps<typeof PlaceResultSheet>> = {}) {
  const events: SheetEvent[] = [];
  const onAuthenticationRequired = jest.fn();
  const renderer = await renderTracked(
    <PlaceResultSheet
      places={CACHED_PLACES}
      height={700}
      onDetailViewChange={isDetailView => {
        events.push({detailShown: isDetailView});
      }}
      onSavedPlaceDeleted={savedPlaceId => {
        events.push({deletedSavedPlaceId: savedPlaceId, cachedNames: cachedPlaceNames()});
      }}
      onAuthenticationRequired={onAuthenticationRequired}
      {...props}
    />,
  );
  return {renderer, events, onAuthenticationRequired};
}

/** 목록에서 장소를 눌러 상세를 열고, 상세의 더보기로 삭제 시트를 엽니다. */
async function openDeleteSheet(renderer: Renderer, placeName: string) {
  await pressLabel(renderer, `${placeName} 상세 보기`);
  await act(async () => renderer.root.findByType(PlaceDetailContent).props.onPressMore());
}

/** 시트가 상세와 목록 가운데 어느 쪽을 그리는지 봅니다. */
const shownView = (renderer: Renderer) =>
  renderer.root.findAllByType(PlaceDetailContent).length > 0 ? '상세' : '목록';

/** 삭제 시트가 열렸는지, 지우는 중이라 버튼을 막았는지, 어떤 오류를 보이는지 함께 봅니다. */
function deleteSheetState(renderer: Renderer) {
  const {visible, isDeleting, deleteError} = renderer.root.findByType(PlaceDetailActionSheet).props;
  return {visible, isDeleting, deleteError};
}

beforeEach(() => {
  clearSavedPlacesCache();
  writeSavedPlacesCache(CACHED_PLACES, getSavedPlacesCacheGeneration());
  jest.mocked(getPlaceReels).mockReset().mockResolvedValue([]);
  jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
  jest.mocked(getSavedPlaces).mockReset();
});

test.each([
  ['지우기에 성공하면', () => undefined],
  [
    '응답이 늦어 실패해도 다시 읽은 목록에 없으면',
    () => {
      jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
      jest.mocked(getSavedPlaces).mockResolvedValue([BAKERY]);
    },
  ],
])('%s 캐시에서 뺀 뒤 지운 저장 ID를 지도 화면에 알리고 목록으로 돌아간다', async (_condition, arrange) => {
  arrange();
  const {renderer, events} = await renderSheet();
  await openDeleteSheet(renderer, '카페');
  await pressLabel(renderer, DELETE_LABEL);

  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]]]);
  expect(events).toEqual([
    {detailShown: false},
    {detailShown: true},
    {deletedSavedPlaceId: CAFE.id, cachedNames: ['빵집']},
    {detailShown: false},
  ]);
  expect(shownView(renderer)).toBe('목록');
});

test('서버 오류로 지우기에 실패하면 삭제 시트에 오류를 보이고 로그인 요청과 알림 없이 상세에 머물며, 다시 눌러 지우면 그때 알리고 돌아간다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValueOnce(SERVER_ERROR).mockResolvedValueOnce(undefined);
  const {renderer, events, onAuthenticationRequired} = await renderSheet();
  await openDeleteSheet(renderer, '카페');
  await pressLabel(renderer, DELETE_LABEL);

  expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: false, deleteError: SERVER_ERROR});
  expect(events).toEqual([{detailShown: false}, {detailShown: true}]);
  expect(shownView(renderer)).toBe('상세');
  expect(onAuthenticationRequired).not.toHaveBeenCalled();

  await pressLabel(renderer, DELETE_LABEL);
  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]], [[CAFE.id]]]);
  expect(events).toEqual([
    {detailShown: false},
    {detailShown: true},
    {deletedSavedPlaceId: CAFE.id, cachedNames: ['빵집']},
    {detailShown: false},
  ]);
  expect(shownView(renderer)).toBe('목록');
});

test('로그인이 필요하다는 오류로 실패하면 삭제 시트에 오류를 보이고 로그인을 요청하며, 알리지도 돌아가지도 않는다', async () => {
  jest.mocked(deleteSavedPlaces).mockRejectedValue(AUTH_ERROR);
  const {renderer, events, onAuthenticationRequired} = await renderSheet();
  await openDeleteSheet(renderer, '카페');
  await pressLabel(renderer, DELETE_LABEL);

  expect(onAuthenticationRequired.mock.calls).toEqual([[]]);
  expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: false, deleteError: AUTH_ERROR});
  expect(events).toEqual([{detailShown: false}, {detailShown: true}]);
  expect(shownView(renderer)).toBe('상세');
});

test('지우는 동안에는 상세와 삭제 시트에 머물며 삭제 버튼을 막고, 다시 눌러도 지우기를 한 번만 보낸다', async () => {
  const request = deferred<void>();
  jest.mocked(deleteSavedPlaces).mockReturnValue(request.promise);
  const {renderer, events} = await renderSheet();
  await openDeleteSheet(renderer, '카페');
  await pressLabel(renderer, DELETE_LABEL);

  expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: true, deleteError: null});
  // pressLabel은 disabled를 보지 않고 누르므로, 버튼을 막은 것과 따로 시트가 겹친 지우기를 거르는지 봅니다.
  await pressLabel(renderer, DELETE_LABEL);
  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]]]);
  expect(events).toEqual([{detailShown: false}, {detailShown: true}]);
  expect(shownView(renderer)).toBe('상세');

  await act(async () => request.resolve());
  await flushMicrotasks();
  expect(events).toEqual([
    {detailShown: false},
    {detailShown: true},
    {deletedSavedPlaceId: CAFE.id, cachedNames: ['빵집']},
    {detailShown: false},
  ]);
  expect(shownView(renderer)).toBe('목록');
});

test('비회원 체험 장소는 API 대신 비회원 삭제 콜백으로 지우고, 저장 장소를 지웠다고 알리지 않고 목록으로 돌아간다', async () => {
  const onDeleteGuestPlaces = jest.fn();
  const {renderer, events} = await renderSheet({
    places: GUEST_PLACES,
    guestReelsByPlace: {},
    onDeleteGuestPlaces,
  });
  await openDeleteSheet(renderer, '체험 카페');
  await pressLabel(renderer, DELETE_LABEL);

  expect(onDeleteGuestPlaces.mock.calls).toEqual([[['guest-1']]]);
  expect(deleteSavedPlaces).not.toHaveBeenCalled();
  expect(events).toEqual([{detailShown: false}, {detailShown: true}, {detailShown: false}]);
  expect(shownView(renderer)).toBe('목록');
});
