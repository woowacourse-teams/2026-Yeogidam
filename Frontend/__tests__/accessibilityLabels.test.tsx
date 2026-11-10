import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {FOLDER_COLORS, getFolderColorName} from '../src/entities/folder/color';
import type {HistoryReel} from '../src/entities/content/types';
import type {Place} from '../src/entities/place/types';
import {CopyToastProvider} from '../src/pages/place-detail/components/CopyToast';
import {PlaceDetailHeader} from '../src/pages/place-detail/components/PlaceDetailHeader';
import {PlaceInfo} from '../src/pages/place-detail/components/PlaceInfo';
import {SavedPlaceGrid} from '../src/pages/saved-places/components/SavedPlaceGrid';
import {SavedPostGrid} from '../src/pages/saved-places/components/SavedPostGrid';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('../src/assets/icons/place-detail/instagram-outline.svg', () => 'InstagramIcon');

const place: Place = {
  id: 'place-1',
  name: '테스트 카페',
  category: '음식점 > 카페',
  address: '서울시 성동구',
  fullAddress: '서울시 성동구 테스트로 1',
  latitude: 37.5448,
  longitude: 127.0557,
  placeUrl: 'https://map.kakao.com/example',
  savedAt: '2026-09-28T00:00:00.000Z',
  image: {uri: 'https://example.com/place.png'},
};

const reel = {
  id: '1',
  instagram_url: 'https://www.instagram.com/reel/a/',
  instagram_title: '성수 카페 모음',
  instagram_description: '성수 카페 모음',
  instagram_author_username: 'seongsu_cafe',
  instagram_thumbnail_url: null,
  processing_status: 'COMPLETED',
  failure_reason: null,
  save_mode: null,
  created_at: '2026-11-04T03:00:00Z',
} as HistoryReel;

async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

function findByLabelPrefix(
  renderer: ReactTestRenderer.ReactTestRenderer,
  prefix: string,
) {
  return renderer.root.findAll(
    node =>
      typeof node.props.accessibilityLabel === 'string' &&
      node.props.accessibilityLabel.startsWith(prefix),
  );
}

describe('보관함 카드 (S6)', () => {
  test('게시물 카드는 종류·제목·작성자를 읽는다', async () => {
    const renderer = await render(<SavedPostGrid onPressReel={jest.fn()} reels={[reel]} />);

    const labels = findByLabelPrefix(renderer, '게시물, ').map(
      node => node.props.accessibilityLabel,
    );
    expect(labels).toContain('게시물, 성수 카페 모음, 작성자 seongsu_cafe');
  });

  test('장소 카드는 종류·이름·카테고리를 읽고, 편집 중에는 선택 동작을 덧붙인다', async () => {
    const renderer = await render(
      <SavedPlaceGrid isEditing onPressPlace={jest.fn()} places={[place]} />,
    );

    const labels = findByLabelPrefix(renderer, '장소, ').map(
      node => node.props.accessibilityLabel,
    );
    expect(labels).toContain('장소, 테스트 카페, 카페, 선택');
  });
});

describe('장소 상세 (P1–P4)', () => {
  test('상단 장소 이름은 "장소 이름"을 붙인 머리말로 읽는다', async () => {
    const renderer = await render(
      <PlaceDetailHeader onBack={jest.fn()} title="테스트 카페" titleInHeader />,
    );

    const title = renderer.root.findByProps({accessibilityLabel: '장소 이름, 테스트 카페'});
    expect(title.props.accessibilityRole).toBe('header');
  });

  test('카테고리와 주소는 항목 이름을 붙여 한 줄로 읽는다', async () => {
    const renderer = await render(
      <CopyToastProvider>
        <PlaceInfo place={place} />
      </CopyToastProvider>,
    );

    const category = renderer.root.findAllByProps({accessibilityLabel: '카테고리, 카페'});
    const address = renderer.root.findAllByProps({
      accessibilityLabel: '주소, 서울시 성동구 테스트로 1',
    });
    expect(category.length).toBeGreaterThan(0);
    expect(address.length).toBeGreaterThan(0);
    // 아이콘이 따로 잡히지 않도록 줄 전체가 하나의 요소다.
    expect(category[0].props.accessible).toBe(true);
    expect(address[0].props.accessible).toBe(true);
  });
});

describe('폴더 색상 (F1)', () => {
  test('색상 코드 대신 색 이름으로 읽는다', () => {
    expect(FOLDER_COLORS.map(getFolderColorName)).toEqual([
      '빨강',
      '주황',
      '노랑',
      '초록',
      '청록',
      '보라',
      '분홍',
    ]);
    expect(getFolderColorName('#000000')).toBe('기본 색');
  });
});
