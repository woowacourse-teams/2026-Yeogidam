import React from 'react';
import {Linking} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  historyReelPlaceToPlace,
  placeReelToHistoryReel,
} from '../src/entities/content/convert';
import type {HistoryReelPlace} from '../src/entities/content/types';
import type {PlaceReel} from '../src/entities/info/types';
import {PlacePostGrid} from '../src/pages/place-detail/components/PlacePostGrid';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('../src/assets/icons/social/instagram.svg', () => 'InstagramIcon', {
  virtual: true,
});

const placeReel: PlaceReel = {
  id: '81',
  instagramUrl: 'https://www.instagram.com/reel/abc/',
  instagramAuthorUsername: 'seongsu_cafe',
  instagramDescription: '성수 카페 투어',
  instagramThumbnailUrl: 'https://cdn.example.com/81.jpg',
  createdAt: '2026-11-04T00:00:00Z',
};

describe('게시물·장소 변환', () => {
  test('장소 상세의 게시물을 완료된 공유 이력으로 바꾼다', () => {
    expect(placeReelToHistoryReel(placeReel)).toEqual({
      id: '81',
      instagram_url: 'https://www.instagram.com/reel/abc/',
      instagram_title: null,
      instagram_description: '성수 카페 투어',
      instagram_author_username: 'seongsu_cafe',
      instagram_thumbnail_url: 'https://cdn.example.com/81.jpg',
      processing_status: 'COMPLETED',
      failure_reason: null,
      save_mode: null,
      created_at: '2026-11-04T00:00:00Z',
    });
  });

  test('게시물 상세의 찾은 장소를 장소 상세 모델로 바꾼다', () => {
    const item: HistoryReelPlace = {
      id: '1',
      position: 0,
      savedPlaceId: '55',
      place: {
        id: '7',
        name: '카페 온월',
        category: '음식점 > 카페',
        source_address: null,
        road_address: '서울 성동구 성수이로 88',
        address: null,
        latitude: 37.5,
        longitude: 127.05,
        kakao_place_url: 'https://place.map.kakao.com/7',
        thumbnail_url: 'https://cdn.example.com/p.jpg',
        photo_attribution: null,
      },
    };

    expect(historyReelPlaceToPlace(item)).toEqual({
      id: '7',
      savedPlaceId: '55',
      name: '카페 온월',
      category: '음식점 > 카페',
      address: '서울 성동구 성수이로 88',
      fullAddress: '서울 성동구 성수이로 88',
      latitude: 37.5,
      longitude: 127.05,
      placeUrl: 'https://place.map.kakao.com/7',
      image: {uri: 'https://cdn.example.com/p.jpg'},
    });
    expect(historyReelPlaceToPlace({...item, place: null})).toBeNull();
  });
});

describe('장소 상세 게시물 카드', () => {
  async function renderGrid(onOpenReel?: (reel: PlaceReel) => void) {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PlacePostGrid reels={[placeReel]} onOpenReel={onOpenReel} />,
      );
    });
    await ReactTestRenderer.act(async () => {
      renderer.root
        .findAll(node => typeof node.props.onLayout === 'function')[0]
        .props.onLayout({nativeEvent: {layout: {width: 400}}});
    });
    return renderer;
  }

  beforeEach(() => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  test('핸들러가 있으면 인스타그램 대신 게시물 상세로 이동한다', async () => {
    const onOpenReel = jest.fn();
    const renderer = await renderGrid(onOpenReel);
    const card = renderer.root.findAll(
      node => node.props.accessibilityLabel === '게시물 상세 열기',
    )[0];

    ReactTestRenderer.act(() => card.props.onPress());

    expect(onOpenReel).toHaveBeenCalledWith(placeReel);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  test('핸들러가 없으면 기존처럼 인스타그램을 연다', async () => {
    const renderer = await renderGrid();
    const card = renderer.root.findAll(
      node => node.props.accessibilityLabel === 'Instagram 릴스 열기',
    )[0];

    ReactTestRenderer.act(() => card.props.onPress());

    expect(Linking.openURL).toHaveBeenCalledWith(placeReel.instagramUrl);
  });
});
