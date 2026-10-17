import React from 'react';
import {FlatList} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {deleteSavedPlaces, getPlaceReels, getSavedPlaces} from '../src/entities/info/api';
import {
  clearSavedPlacesCache,
  getSavedPlacesCacheGeneration,
  writeSavedPlacesCache,
} from '../src/entities/info/saved-places-cache';
import {PROCESSING_ERROR} from '../src/lib/api/screen-error';
import {PlaceResultSheet} from '../src/pages/map/components/PlaceResultSheet';
import {PlaceDetailActionSheet} from '../src/pages/place-detail/components/PlaceDetailActionSheet';
import {PlaceDetailContent} from '../src/pages/place-detail/components/PlaceDetailContent';
import {cachedPlaceNames} from './support/cachedPlaceNames';
import {deferred} from './support/deferred';
import {pressLabel} from './support/pressLabel';
import {flushMicrotasks, renderTracked, type Renderer} from './support/renderers';
import {
  AUTH_ERROR,
  AUTH_ERROR_WITHOUT_STATUS,
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
const EXPAND_LABEL = '검색 결과 펼치기';

/**
 * 시트가 지도 화면에 알린 일을 차례로 적습니다. 지운 장소를 알릴 때는 그때 캐시에 남은 이름도 적어, 캐시에서 뺀 뒤에 알렸는지 봅니다.
 * expanded는 시트가 페이지처럼 펼쳐졌는지이고, 지도 화면은 상세가 펼쳐졌을 때만 머리글의 뒤로 가기와 더보기를 보입니다.
 */
type SheetEvent =
  | {detailShown: boolean; placeId: string | null}
  | {expanded: boolean}
  | {deletedSavedPlaceId: string; cachedNames: string[] | undefined};

type SheetProps = React.ComponentProps<typeof PlaceResultSheet>;
type Sheet = Awaited<ReturnType<typeof renderSheet>>;

async function renderSheet(props: Partial<SheetProps> = {}) {
  const events: SheetEvent[] = [];
  const onAuthenticationRequired = jest.fn();
  // 다시 그릴 때 콜백이 새로 만들어지면 콜백에 걸린 effect가 다시 돌아 같은 알림을 또 적으므로, 처음 만든 props를 이어 씁니다.
  let currentProps: SheetProps = {
    places: CACHED_PLACES,
    height: 700,
    onDetailViewChange: (isDetailView, placeId) => {
      events.push({detailShown: isDetailView, placeId});
    },
    onExpandedChange: expanded => {
      events.push({expanded});
    },
    onSavedPlaceDeleted: savedPlaceId => {
      events.push({deletedSavedPlaceId: savedPlaceId, cachedNames: cachedPlaceNames()});
    },
    onAuthenticationRequired,
    ...props,
  };
  const renderer = await renderTracked(<PlaceResultSheet {...currentProps} />);

  /** 지도 화면이 신호 props를 올려 다시 그리는 일을 흉내 냅니다. 넘기지 않은 props는 앞의 값을 그대로 씁니다. */
  async function rerender(nextProps: Partial<SheetProps>) {
    currentProps = {...currentProps, ...nextProps};
    await act(async () => renderer.update(<PlaceResultSheet {...currentProps} />));
    await flushMicrotasks();
  }

  return {renderer, events, onAuthenticationRequired, rerender};
}

/** 목록에서 장소를 눌러 상세를 열고, 상세의 더보기로 삭제 시트를 엽니다. */
async function openDeleteSheet(renderer: Renderer, placeName: string) {
  await pressLabel(renderer, `${placeName} 상세 보기`);
  await openShownPlaceDeleteSheet(renderer);
}

/** 지금 보이는 상세의 더보기로 삭제 시트를 엽니다. */
async function openShownPlaceDeleteSheet(renderer: Renderer) {
  await act(async () => renderer.root.findByType(PlaceDetailContent).props.onPressMore());
}

/** 삭제 시트를 닫고 지도 화면의 뒤로 가기로 목록에 돌아가 다른 장소를 엽니다. 닫기와 뒤로 가기는 지우는 동안에도 막지 않습니다. */
async function closeDeleteSheetAndOpenPlace(sheet: Sheet, placeName: string) {
  await act(async () => sheet.renderer.root.findByType(PlaceDetailActionSheet).props.onClose());
  await sheet.rerender({backToPlaceListSignal: 1});
  await pressLabel(sheet.renderer, `${placeName} 상세 보기`);
}

/** 시트가 상세와 목록 가운데 어느 쪽을 그리는지 봅니다. 둘 다 그리지 않으면 '없음'입니다. */
function shownView(renderer: Renderer) {
  if (renderer.root.findAllByType(PlaceDetailContent).length > 0) return '상세';
  return renderer.root.findAllByType(FlatList).length > 0 ? '목록' : '없음';
}

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
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: CAFE.place.id},
    {deletedSavedPlaceId: CAFE.id, cachedNames: ['빵집']},
    {detailShown: false, placeId: null},
  ]);
  expect(shownView(renderer)).toBe('목록');
});

test('지우고 목록으로 돌아간 뒤 다른 장소를 열면 삭제 시트는 닫혀 있고 지우는 중으로 남지 않는다', async () => {
  const {renderer} = await renderSheet();
  await openDeleteSheet(renderer, '카페');
  await pressLabel(renderer, DELETE_LABEL);
  await pressLabel(renderer, '빵집 상세 보기');

  expect(deleteSheetState(renderer)).toEqual({visible: false, isDeleting: false, deleteError: null});
});

test.each([
  ['서버 오류로', () => jest.mocked(deleteSavedPlaces).mockRejectedValue(SERVER_ERROR), SERVER_ERROR],
  [
    '다시 시도할 수 없는 응답 처리 오류로',
    () => jest.mocked(deleteSavedPlaces).mockRejectedValue({...PROCESSING_ERROR}),
    {...PROCESSING_ERROR},
  ],
  [
    '응답이 늦은 뒤 다시 읽은 목록에 남아 있어',
    () => {
      jest.mocked(deleteSavedPlaces).mockRejectedValue(TIMEOUT_ERROR);
      jest.mocked(getSavedPlaces).mockResolvedValue([CAFE, BAKERY]);
    },
    TIMEOUT_ERROR,
  ],
])(
  '%s 지우지 못하면 삭제 시트에 오류를 보이고, 로그인을 요청하지도 지도 화면에 알리지도 목록으로 돌아가지도 않는다',
  async (_condition, arrange, expectedError) => {
    arrange();
    const {renderer, events, onAuthenticationRequired} = await renderSheet();
    await openDeleteSheet(renderer, '카페');
    await pressLabel(renderer, DELETE_LABEL);

    expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: false, deleteError: expectedError});
    expect(onAuthenticationRequired).not.toHaveBeenCalled();
    expect(events).toEqual([
      {detailShown: false, placeId: null},
      {detailShown: true, placeId: CAFE.place.id},
    ]);
    expect(shownView(renderer)).toBe('상세');
  },
);

test.each([
  ['로그인이 필요하다는 서버 응답으로', AUTH_ERROR],
  ['로그인 정보를 읽지 못해 상태 없이 온 로그인 필요 오류로', AUTH_ERROR_WITHOUT_STATUS],
])(
  '%s 실패하면 삭제 시트에 오류를 보이고 로그인을 요청하며, 지도 화면에 알리지도 목록으로 돌아가지도 않는다',
  async (_condition, error) => {
    jest.mocked(deleteSavedPlaces).mockRejectedValue(error);
    const {renderer, events, onAuthenticationRequired} = await renderSheet();
    await openDeleteSheet(renderer, '카페');
    await pressLabel(renderer, DELETE_LABEL);

    expect(onAuthenticationRequired.mock.calls).toEqual([[]]);
    expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: false, deleteError: error});
    expect(events).toEqual([
      {detailShown: false, placeId: null},
      {detailShown: true, placeId: CAFE.place.id},
    ]);
    expect(shownView(renderer)).toBe('상세');
  },
);

test('지우기에 실패한 뒤 다시 누르면 지난 오류를 지우고 지우는 중으로 바꾸며, 성공하면 그때 알리고 목록으로 돌아간다', async () => {
  const retry = deferred<void>();
  jest.mocked(deleteSavedPlaces).mockRejectedValueOnce(SERVER_ERROR).mockReturnValueOnce(retry.promise);
  const {renderer, events} = await renderSheet();
  await openDeleteSheet(renderer, '카페');
  await pressLabel(renderer, DELETE_LABEL);
  expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: false, deleteError: SERVER_ERROR});

  await pressLabel(renderer, DELETE_LABEL);
  expect(deleteSheetState(renderer)).toEqual({visible: true, isDeleting: true, deleteError: null});

  await act(async () => retry.resolve());
  await flushMicrotasks();
  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]], [[CAFE.id]]]);
  expect(events).toEqual([
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: CAFE.place.id},
    {deletedSavedPlaceId: CAFE.id, cachedNames: ['빵집']},
    {detailShown: false, placeId: null},
  ]);
  expect(shownView(renderer)).toBe('목록');
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
  expect(events).toEqual([
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: CAFE.place.id},
  ]);
  expect(shownView(renderer)).toBe('상세');

  await act(async () => request.resolve());
  await flushMicrotasks();
  expect(events).toEqual([
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: CAFE.place.id},
    {deletedSavedPlaceId: CAFE.id, cachedNames: ['빵집']},
    {detailShown: false, placeId: null},
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
  expect(events).toEqual([
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: 'guest-1'},
    {detailShown: false, placeId: null},
  ]);
  expect(shownView(renderer)).toBe('목록');
});

test('중간 높이 목록에서 연 상세를 펼친 뒤 뒤로 가면 먼저 상세를 펼치기 전 높이로 내리기만 하고, 한 번 더 뒤로 가야 목록으로 돌아간다', async () => {
  const {renderer, events, rerender} = await renderSheet();
  await pressLabel(renderer, '카페 상세 보기');
  await pressLabel(renderer, EXPAND_LABEL);

  await rerender({backToPlaceListSignal: 1});
  expect(events).toEqual([
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: CAFE.place.id},
    {expanded: true},
    {expanded: false},
  ]);
  expect(shownView(renderer)).toBe('상세');

  await rerender({backToPlaceListSignal: 2});
  expect(events).toEqual([
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: CAFE.place.id},
    {expanded: true},
    {expanded: false},
    {detailShown: false, placeId: null},
  ]);
  expect(shownView(renderer)).toBe('목록');
});

test('지우는 동안 목록으로 갔다가 지우던 장소를 다시 열면 그 삭제 버튼은 막혀 있고, 지우기가 끝나면 지운 장소의 상세를 닫고 목록으로 돌아간다', async () => {
  const request = deferred<void>();
  jest.mocked(deleteSavedPlaces).mockReturnValueOnce(request.promise);
  const sheet = await renderSheet();
  await openDeleteSheet(sheet.renderer, '카페');
  await pressLabel(sheet.renderer, DELETE_LABEL);
  await closeDeleteSheetAndOpenPlace(sheet, '카페');
  await openShownPlaceDeleteSheet(sheet.renderer);

  expect(deleteSheetState(sheet.renderer)).toEqual({visible: true, isDeleting: true, deleteError: null});
  await pressLabel(sheet.renderer, DELETE_LABEL);
  expect(jest.mocked(deleteSavedPlaces).mock.calls).toEqual([[[CAFE.id]]]);

  await act(async () => request.resolve());
  await flushMicrotasks();
  expect(sheet.events).toEqual([
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: CAFE.place.id},
    {detailShown: false, placeId: null},
    {detailShown: true, placeId: CAFE.place.id},
    {deletedSavedPlaceId: CAFE.id, cachedNames: ['빵집']},
    {detailShown: false, placeId: null},
  ]);
  expect(shownView(sheet.renderer)).toBe('목록');
});
