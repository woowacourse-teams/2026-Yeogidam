import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {saveMediaPlace} from '../src/entities/content/saved-media-api';
import {deleteSavedPlaces} from '../src/entities/info/api';
import type {PlaceReel} from '../src/entities/info/types';
import type {Place} from '../src/entities/place/types';
import {subscribeSavedPlaceChanged} from '../src/lib/saved-place-events';
import {usePlaceBookmark} from '../src/pages/place-detail/usePlaceBookmark';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('../src/entities/info/api', () => ({
  deleteSavedPlaces: jest.fn(),
  getSavedPlaces: jest.fn(),
}));
jest.mock('../src/entities/content/saved-media-api', () => ({
  saveMediaPlace: jest.fn(),
}));
jest.mock('../src/lib/app-alert', () => ({showAlert: jest.fn()}));

const savedPlace = {id: '42', savedPlaceId: '7', name: '카페'} as Place;
const unsavedPlace = {id: '42', name: '카페'} as Place;
const reels = [{id: '81'}] as PlaceReel[];

describe('usePlaceBookmark', () => {
  let bookmark: ReturnType<typeof usePlaceBookmark>;
  const onLeaveAfterChange = jest.fn();

  function Harness({place, postReels = reels}: {place: Place | null; postReels?: PlaceReel[]}) {
    bookmark = usePlaceBookmark({
      place,
      reels: postReels,
      isReelsLoading: false,
      analyticsSource: 'place_detail',
      onLeaveAfterChange,
    });
    return null;
  }

  async function render(place: Place, postReels?: PlaceReel[]) {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Harness place={place} postReels={postReels} />);
    });
    return renderer;
  }

  const toggle = () => ReactTestRenderer.act(async () => bookmark.toggle());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(deleteSavedPlaces).mockResolvedValue(undefined);
    jest.mocked(saveMediaPlace).mockResolvedValue('9');
  });

  test('해제하면 화면을 떠나지 않고 빈 상태로 바꾸고 안내한다', async () => {
    await render(savedPlace);
    expect(bookmark.isBookmarked).toBe(true);

    await toggle();

    expect(deleteSavedPlaces).toHaveBeenCalledWith(['7']);
    expect(bookmark.isBookmarked).toBe(false);
    expect(bookmark.notice?.message).toBe('북마크를 해제했어요.');
  });

  test('다시 누르면 장소의 게시물 ID로 저장한다', async () => {
    await render(savedPlace);
    await toggle();
    await toggle();

    expect(saveMediaPlace).toHaveBeenCalledWith('81', '42');
    expect(bookmark.isBookmarked).toBe(true);
    expect(bookmark.notice?.message).toBe('북마크에 저장했어요.');
  });

  test('다시 저장 뒤 해제에는 새 저장 ID를 쓴다', async () => {
    await render(savedPlace);
    await toggle();
    await toggle();
    await toggle();

    expect(deleteSavedPlaces).toHaveBeenLastCalledWith(['9']);
  });

  test('게시물이 없는 장소는 저장하지 않고 안내한다', async () => {
    await render(unsavedPlace, []);

    await toggle();

    expect(saveMediaPlace).not.toHaveBeenCalled();
    expect(bookmark.isBookmarked).toBe(false);
    expect(bookmark.notice?.message).toBe('이 장소의 게시물이 없어 저장할 수 없어요.');
  });

  test('목록 갱신은 바뀐 채로 상세를 벗어날 때 한 번만 알린다', async () => {
    const renderer = await render(savedPlace);
    await toggle();
    expect(onLeaveAfterChange).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer.update(<Harness place={null} />);
    });

    expect(onLeaveAfterChange).toHaveBeenCalledTimes(1);
  });

  test('아무것도 바꾸지 않고 벗어나면 알리지 않는다', async () => {
    const renderer = await render(savedPlace);

    await ReactTestRenderer.act(async () => {
      renderer.update(<Harness place={null} />);
    });

    expect(onLeaveAfterChange).not.toHaveBeenCalled();
  });

  test('뒤에 유지된 화면에 바뀐 저장 상태를 알린다', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSavedPlaceChanged(listener);
    await render(savedPlace);

    await toggle();

    expect(listener).toHaveBeenCalledWith({placeId: '42', savedPlaceId: null});
    unsubscribe();
  });
});
