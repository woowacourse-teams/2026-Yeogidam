import React from 'react';
import {Linking, ScrollView, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {getHistoryReelDetail, reportHistoryReel} from '../src/entities/content/history-api';
import {saveMediaPlace} from '../src/entities/content/saved-media-api';
import {deleteSavedPlaces} from '../src/entities/info/api';
import {showAlert} from '../src/lib/app-alert';
import type {HistoryReel} from '../src/entities/content/types';
import {
  getReelBackGestureRegion,
  ReelDetailScreen,
  shouldCaptureSheetDrag,
} from '../src/pages/reel-detail/ReelDetailScreen';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 47, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReelDetail: jest.fn(),
  reportHistoryReel: jest.fn(),
}));
jest.mock('../src/entities/content/saved-media-api', () => ({saveMediaPlace: jest.fn()}));
jest.mock('../src/entities/info/api', () => ({deleteSavedPlaces: jest.fn()}));
jest.mock('../src/lib/app-alert', () => ({showAlert: jest.fn()}));

const LONG_CAPTION =
  '성수동에서 주말에도 웨이팅 없이 갈 수 있는 감성 카페 5곳을 모아봤어요. 1. 카페 온월 - 시그니처 라떼가 정말 맛있어요 2. 담다식당 - 점심 한정 메뉴 꼭 드세요';

const reel: HistoryReel = {
  id: '8',
  instagram_url: 'https://www.instagram.com/reel/abc/',
  instagram_title: null,
  instagram_description: LONG_CAPTION,
  instagram_author_username: 'seongsu_cafe',
  instagram_thumbnail_url: 'https://cdn.example.com/8.jpg',
  processing_status: 'COMPLETED',
  failure_reason: null,
  save_mode: null,
  created_at: '2026-11-04T03:00:00Z',
};

function place(id: string, name: string, category: string, address: string) {
  return {
    id,
    position: Number(id),
    place: {
      id,
      name,
      category,
      source_address: null,
      road_address: address,
      address: null,
      latitude: null,
      longitude: null,
      kakao_place_url: null,
      thumbnail_url: null,
      photo_attribution: null,
    },
  };
}

function texts(renderer: ReactTestRenderer.ReactTestRenderer) {
  return renderer.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat().join(''));
}

async function render(onBack = jest.fn()) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <ReelDetailScreen onBack={onBack} reel={reel} />,
    );
  });
  return {renderer, onBack};
}

beforeEach(() => {
  jest.mocked(saveMediaPlace).mockReset().mockResolvedValue('99');
  jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
  jest.mocked(reportHistoryReel).mockReset().mockResolvedValue(undefined);
  jest.mocked(showAlert).mockReset();
  jest.mocked(getHistoryReelDetail).mockReset().mockResolvedValue({
    ...reel,
    extraction: {
      extraction_places: [
        place('1', '카페 온월', '음식점 > 카페 > 커피전문점', '서울 성동구 성수이로 88 2층'),
        place('2', '담다 식당', '음식점 > 한식', '서울 성동구 연무장길 41'),
      ],
    },
  });
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.mocked(Linking.openURL).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('게시물의 작성자·캡션과 찾은 장소를 보여 준다', async () => {
  const {renderer} = await render();
  const all = texts(renderer);

  expect(all).toContain('@seongsu_cafe');
  expect(all).toContain(LONG_CAPTION);
  expect(all).toContain('찾은 장소');
  expect(all).toContain('2');
  expect(all).toContain('카페 온월');
  expect(all).toContain('카페'); // 중분류만 알약으로 보여 준다
  expect(all).toContain('서울 성동구 연무장길 41');
  expect(getHistoryReelDetail).toHaveBeenCalledWith(reel);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('캡션 앞의 군더더기와 끝의 따옴표를 걷어내고 보여 준다', async () => {
  const {renderer} = await ((async () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      r = ReactTestRenderer.create(
        <ReelDetailScreen
          onBack={jest.fn()}
          reel={{
            ...reel,
            instagram_description: 'seongsu_cafe on Instagram: "성수 카페 모음\n1. 카페 온월"',
          }}
        />,
      );
    });
    return {renderer: r};
  })());

  const all = texts(renderer);
  expect(all).toContain('성수 카페 모음\n1. 카페 온월');
  expect(all.some(text => text.includes('on Instagram'))).toBe(false);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('접힌 캡션을 누르면 펼치고 접기로 닫는다', async () => {
  const {renderer} = await render();
  expect(texts(renderer)).not.toContain('접기');

  await ReactTestRenderer.act(async () =>
    renderer.root.findByProps({accessibilityLabel: '캡션 펼치기'}).props.onPress(),
  );
  expect(texts(renderer)).toContain('접기');
  expect(texts(renderer)).toContain('@seongsu_cafe · 2026.11.04 공유');

  await ReactTestRenderer.act(async () =>
    renderer.root.findByProps({accessibilityLabel: '캡션 접기'}).props.onPress(),
  );
  expect(texts(renderer)).not.toContain('접기');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('상단 원본 버튼은 확인 전에는 이동하지 않고 열기를 누른 뒤 이동한다', async () => {
  const {renderer, onBack} = await render();

  const back = renderer.root.findByProps({
    accessibilityLabel: '이전 화면으로 돌아가기',
  });
  await ReactTestRenderer.act(async () => back.props.onPress());
  expect(onBack).toHaveBeenCalledTimes(1);

  const original = renderer.root.findByProps({
    accessibilityLabel: '원본 게시물 보기',
  });
  await ReactTestRenderer.act(async () => original.props.onPress());
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(showAlert).toHaveBeenCalledWith(
    '인스타그램에서 원본 게시물을 볼까요?',
    '인스타그램 앱 또는 웹사이트로 이동해요.',
    expect.any(Array),
  );
  const buttons = jest.mocked(showAlert).mock.calls[0][2] ?? [];
  await ReactTestRenderer.act(async () => buttons[0]?.onPress?.());
  expect(Linking.openURL).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => buttons[1]?.onPress?.());
  expect(Linking.openURL).toHaveBeenCalledWith(reel.instagram_url);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('이미지 영역도 확인 후 원본 게시물로 넘어가고 재생 버튼은 없다', async () => {
  const {renderer} = await render();

  expect(
    renderer.root.findAllByProps({name: 'play-arrow'}),
  ).toHaveLength(0);

  await ReactTestRenderer.act(async () =>
    renderer.root.findByProps({accessibilityLabel: '원본 게시물 열기'}).props.onPress(),
  );
  expect(Linking.openURL).not.toHaveBeenCalled();
  const buttons = jest.mocked(showAlert).mock.calls[0][2] ?? [];
  await ReactTestRenderer.act(async () => buttons[1]?.onPress?.());
  expect(Linking.openURL).toHaveBeenCalledWith(reel.instagram_url);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('장소를 불러오지 못하면 안내 문구를 보여 준다', async () => {
  jest.mocked(getHistoryReelDetail).mockRejectedValue(new Error('network'));
  const {renderer} = await render();

  expect(texts(renderer)).toContain('장소를 불러오지 못했어요.');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('스와이프 뒤로가기 구역에서 이전 버튼과 접힌 캡션·접기 위치를 비운다', () => {
  // 844 높이 기준: 시트 윗선 y=600, 접기 영역(44)과 여백(16)을 빼면 구역은 y=100~540.
  expect(getReelBackGestureRegion(844)).toEqual({top: 100, bottom: 304});
});

describe('시트 끌기 제스처', () => {
  const base = {
    dx: 0,
    dy: -40,
    startY: 300,
    sheetTop: 600,
    isExpanded: false,
    isCaptionOpen: false,
  };

  test('접힌 상태에서는 화면 어디서든 위로 끌면 시트를 올린다', () => {
    expect(shouldCaptureSheetDrag(base)).toBe(true);
    expect(shouldCaptureSheetDrag({...base, startY: 100})).toBe(true);
    expect(shouldCaptureSheetDrag({...base, startY: 700})).toBe(true);
  });

  test('아래로 끌기나 가로에 가까운 끌기, 아주 짧은 끌기는 받지 않는다', () => {
    expect(shouldCaptureSheetDrag({...base, dy: 40})).toBe(false);
    expect(shouldCaptureSheetDrag({...base, dx: 50, dy: -40})).toBe(false);
    expect(shouldCaptureSheetDrag({...base, dy: -3})).toBe(false);
  });

  test('캡션이 펼쳐져 있으면 시트에서 시작한 끌기만 받는다', () => {
    expect(shouldCaptureSheetDrag({...base, isCaptionOpen: true, startY: 300})).toBe(false);
    expect(shouldCaptureSheetDrag({...base, isCaptionOpen: true, startY: 650})).toBe(true);
  });

  test('펼친 상태에서는 시트 윗부분·이미지 영역의 아래로 끌기만 받는다', () => {
    const expanded = {...base, isExpanded: true, sheetTop: 250, dy: 40};
    expect(shouldCaptureSheetDrag({...expanded, startY: 100})).toBe(true); // 이미지 영역
    expect(shouldCaptureSheetDrag({...expanded, startY: 300})).toBe(true); // 손잡이·제목 줄
    expect(shouldCaptureSheetDrag({...expanded, startY: 500})).toBe(false); // 장소 목록 스크롤
    expect(shouldCaptureSheetDrag({...expanded, startY: 100, dy: -40})).toBe(false);
  });
});

test('시트 윗부분을 누르면 시트가 펼쳐지고 다시 누르면 접힌다', async () => {
  const {renderer} = await render();

  await ReactTestRenderer.act(async () =>
    renderer.root.findByProps({accessibilityLabel: '찾은 장소 펼치기'}).props.onPress(),
  );
  expect(
    renderer.root.findAllByProps({accessibilityLabel: '찾은 장소 접기'}).length,
  ).toBeGreaterThan(0);

  await ReactTestRenderer.act(async () =>
    renderer.root.findByProps({accessibilityLabel: '찾은 장소 접기'}).props.onPress(),
  );
  expect(
    renderer.root.findAllByProps({accessibilityLabel: '찾은 장소 펼치기'}).length,
  ).toBeGreaterThan(0);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('장소 북마크 버튼은 savedPlaceId로 표시하고 활성화와 해제를 호출한다', async () => {
  const {renderer} = await render();
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: '카페 온월 북마크하기'}).props.onPress();
  });
  expect(saveMediaPlace).toHaveBeenCalledWith('8', '1');
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: '카페 온월 북마크 해제'}).props.onPress();
  });
  expect(deleteSavedPlaces).toHaveBeenCalledWith(['99']);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('성공 게시물 제보는 확인 뒤 한 번 호출하고 완료 상태로 막는다', async () => {
  const {renderer} = await render();
  const sheetScroll = renderer.root.findAllByType(ScrollView).find(scroll =>
    scroll.findAllByProps({accessibilityLabel: '게시물 제보하기'}).length > 0,
  );
  expect(sheetScroll).toBeDefined();
  const sheetTexts = sheetScroll!.findAllByType(Text).map(node => node.props.children);
  expect(sheetTexts.indexOf('장소가 빠졌거나 잘못 찾았나요?')).toBeGreaterThan(
    sheetTexts.indexOf('카페 온월'),
  );
  await ReactTestRenderer.act(async () => {
    renderer.root.findByProps({accessibilityLabel: '게시물 제보하기'}).props.onPress();
  });
  expect(reportHistoryReel).not.toHaveBeenCalled();
  const buttons = jest.mocked(showAlert).mock.calls[0][2] ?? [];
  await ReactTestRenderer.act(async () => buttons[1]?.onPress?.());
  expect(reportHistoryReel).toHaveBeenCalledWith('8');
  expect(renderer.root.findByProps({accessibilityLabel: '제보 완료'}).props.disabled).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
