import React from 'react';
import {Keyboard, Text, TextInput} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {SearchBar} from '../src/components/SearchBar';
import * as accessibility from '../src/lib/accessibility';
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

  test('장소 카드는 종류·이름·카테고리를 읽는다', async () => {
    const renderer = await render(<SavedPlaceGrid onPressPlace={jest.fn()} places={[place]} />);

    const labels = findByLabelPrefix(renderer, '장소, ').map(
      node => node.props.accessibilityLabel,
    );
    expect(labels).toContain('장소, 테스트 카페, 카페');
  });

  test('편집 중에는 이름 뒤에 선택 여부를 값으로 읽는다 (S4)', async () => {
    const renderer = await render(
      <SavedPlaceGrid
        isEditing
        onPressPlace={jest.fn()}
        places={[place]}
        selectedPlaceIds={new Set(['place-1'])}
      />,
    );

    const [card] = findByLabelPrefix(renderer, '장소, ');
    expect(card.props.accessibilityLabel).toBe('장소, 테스트 카페, 카페');
    expect(card.props.accessibilityValue).toEqual({text: '선택됨'});
    expect(card.props.accessibilityHint).toBe('두 번 탭하면 선택을 해제해요');
  });
});

describe('장소 상세 (P1–P4)', () => {
  test('상단 장소 이름은 "장소 이름"을 붙인 머리말로 읽는다', async () => {
    const renderer = await render(
      <PlaceDetailHeader onBack={jest.fn()} title="테스트 카페" titleInHeader />,
    );

    const title = renderer.root.findByProps({accessibilityLabel: '장소 이름, 테스트 카페'});
    expect(title.props.accessibilityRole).toBe('header');
    // iOS에서 Text는 포커스 이동 요청을 받지 못하므로, 포커스를 옮길 머리말은 View여야 한다.
    expect(title.type).not.toBe(Text);
    expect(title.props.accessible).toBe(true);
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

describe('키보드 (K1)', () => {
  test('검색창에서 두 손가락 문지르기(Z) 제스처로 키보드를 내린다', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const renderer = await render(<SearchBar layout="embedded" onChangeText={jest.fn()} />);

    const input = renderer.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === '장소, 지역 검색');
    expect(input).toBeDefined();
    input!.props.onAccessibilityEscape();
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });
});

describe('검색창 (K2)', () => {
  test('검색 패널 입력창이 열리면 스크린 리더 포커스를 입력창으로 옮긴다', async () => {
    const focusSpy = jest.spyOn(accessibility, 'focusAccessibility');
    const renderer = await render(
      <SearchBar autoFocus layout="embedded" onChangeText={jest.fn()} />,
    );

    expect(focusSpy).toHaveBeenCalledTimes(1);
    const [, delayMs] = focusSpy.mock.calls[0];
    expect(delayMs).toBe(300);
    await ReactTestRenderer.act(async () => renderer.unmount());
    focusSpy.mockRestore();
  });

  test('눌러서 여는 검색창은 무엇을 하는지 힌트로 알려 준다', async () => {
    const renderer = await render(<SearchBar layout="header" onPress={jest.fn()} />);

    expect(
      renderer.root.findAllByProps({accessibilityHint: '두 번 탭하면 검색어를 입력할 수 있어요'})
        .length,
    ).toBeGreaterThan(0);
  });
});
