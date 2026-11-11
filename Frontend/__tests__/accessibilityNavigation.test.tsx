import React from 'react';
import {StyleSheet, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {BottomNavigationBar} from '../src/components/BottomNavigationBar';
import {CategoryFilterChips} from '../src/components/CategoryFilterChips';
import {PlaceTabs} from '../src/pages/place-detail/components/PlaceTabs';
import {SavedPlacesRecentShares} from '../src/pages/saved-places/components/SavedPlacesRecentShares';
import {SavedPlacesViewToggle} from '../src/pages/saved-places/components/SavedPlacesViewToggle';
import {getRecentShareAccessibilityLabel} from '../src/pages/saved-places/shareStatusMessages';
import type {HistoryReel} from '../src/entities/content/types';

jest.mock('posthog-react-native', () => ({usePostHog: () => null}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({top: 47, right: 0, bottom: 34, left: 0}),
}));
jest.mock('../src/entities/content/history-api', () => ({
  getHistoryReelPlaceCount: jest.fn(() => Promise.resolve(2)),
}));

async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(element);
  });
  return renderer;
}

function action(actionName: string) {
  return {nativeEvent: {actionName}};
}

describe('카테고리 필터', () => {
  test('스크린 리더에서는 칩 묶음이 조절 요소 하나로 읽히고 위아래로 카테고리를 바꾼다', async () => {
    const onSelectCategory = jest.fn();
    const renderer = await render(
      <CategoryFilterChips
        categories={['카페', '한식']}
        onSelectCategory={onSelectCategory}
        selectedCategory="카페"
      />,
    );

    const filter = renderer.root.findByProps({accessibilityRole: 'adjustable'});
    expect(filter.props.accessible).toBe(true);
    expect(filter.props.accessibilityLabel).toBe('카테고리 필터');
    expect(filter.props.accessibilityValue).toEqual({text: '카페'});

    ReactTestRenderer.act(() => filter.props.onAccessibilityAction(action('increment')));
    expect(onSelectCategory).toHaveBeenLastCalledWith('한식');
    ReactTestRenderer.act(() => filter.props.onAccessibilityAction(action('decrement')));
    expect(onSelectCategory).toHaveBeenLastCalledWith('전체');
  });

  test('처음과 끝에서는 더 넘어가지 않는다', async () => {
    const onSelectCategory = jest.fn();
    const renderer = await render(
      <CategoryFilterChips
        categories={['카페']}
        onSelectCategory={onSelectCategory}
        selectedCategory="카페"
      />,
    );

    const filter = renderer.root.findByProps({accessibilityRole: 'adjustable'});
    ReactTestRenderer.act(() => filter.props.onAccessibilityAction(action('increment')));
    expect(onSelectCategory).not.toHaveBeenCalled();
  });
});

describe('최근 공유', () => {
  test.each([
    ['PROCESSING', undefined, '최근 공유, 장소 찾는 중'],
    ['PENDING', undefined, '최근 공유, 대기 중'],
    ['COMPLETED', 3, '완료, 장소 3곳 찾음'],
    ['COMPLETED', 0, '완료, 찾은 장소 없음'],
    ['COMPLETED', undefined, '완료'],
    ['FAILED', undefined, '최근 공유, 장소 찾기 실패'],
  ] as const)('%s 상태의 썸네일은 상태를 말로 읽는다 (장소 %s곳)', (status, count, label) => {
    expect(getRecentShareAccessibilityLabel(status, count)).toBe(label);
  });

  const reel = {
    id: '1',
    instagram_url: 'https://www.instagram.com/reel/a/',
    instagram_title: null,
    instagram_description: null,
    instagram_author_username: null,
    instagram_thumbnail_url: null,
    processing_status: 'PROCESSING',
    failure_reason: null,
    save_mode: null,
    created_at: '2026-11-04T03:00:00Z',
  } as HistoryReel;

  test('제목은 제목으로 읽히고, 링크 추가·전체보기 동작을 바로 실행할 수 있다', async () => {
    const onPressAdd = jest.fn();
    const onPressViewAll = jest.fn();
    const renderer = await render(
      <SavedPlacesRecentShares
        onPressAdd={onPressAdd}
        onPressViewAll={onPressViewAll}
        reels={[reel]}
      />,
    );

    const title = renderer.root.findByProps({accessibilityRole: 'header'});
    // iOS에서 Text에 붙인 동작은 VoiceOver에 전달되지 않으므로 View에 붙여야 한다.
    expect(title.type).not.toBe(Text);
    expect(title.props.accessibilityLabel).toBe('최근 공유');
    expect(title.props.accessibilityActions).toEqual([
      {name: 'addLink', label: '링크 추가'},
      {name: 'viewAll', label: '전체보기'},
    ]);
    title.props.onAccessibilityAction(action('addLink'));
    expect(onPressAdd).toHaveBeenCalledTimes(1);
    title.props.onAccessibilityAction(action('viewAll'));
    expect(onPressViewAll).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});

describe('탭', () => {
  test('보관함 탭은 두 번 탭을 위치와 관계없이 바로 처리한다', async () => {
    const onChangeView = jest.fn();
    const onPressEdit = jest.fn();
    const renderer = await render(
      <SavedPlacesViewToggle
        isEditing={false}
        onChangeView={onChangeView}
        onPressEdit={onPressEdit}
        view="posts"
      />,
    );

    const postsTab = renderer.root.findByProps({accessibilityLabel: '게시물 탭'});
    expect(postsTab.props.accessibilityValue).toEqual({text: '선택됨'});
    const placesTab = renderer.root.findByProps({accessibilityLabel: '장소 탭'});
    expect(placesTab.props.accessibilityValue).toBeUndefined();
    placesTab.props.onAccessibilityTap();
    expect(onChangeView).toHaveBeenCalledWith('places');
    renderer.root.findByProps({accessibilityLabel: '보관함 편집'}).props.onAccessibilityTap();
    expect(onPressEdit).toHaveBeenCalledTimes(1);
  });

  test('장소 상세 탭은 "게시물 탭, 선택됨" 순서로 읽고 두 번 탭을 바로 처리한다', async () => {
    const onTabPress = jest.fn();
    const renderer = await render(
      <PlaceTabs activeTab="게시물" onTabPress={onTabPress} />,
    );

    expect(renderer.root.findAllByProps({accessibilityRole: 'tablist'}).length).toBeGreaterThan(0);
    expect(
      renderer.root.findByProps({accessibilityLabel: '게시물 탭'}).props.accessibilityValue,
    ).toEqual({text: '선택됨'});
    const blogTab = renderer.root.findByProps({accessibilityLabel: '블로그 탭'});
    expect(blogTab.props.accessibilityValue).toBeUndefined();
    blogTab.props.onAccessibilityTap();
    expect(onTabPress).toHaveBeenCalledWith('블로그');
  });
});

describe('머리말 이동', () => {
  test('하단 메뉴 앞에 스크린 리더용 머리말이 있다', async () => {
    const renderer = await render(
      <BottomNavigationBar active="saved" isGuest onNavigate={jest.fn()} />,
    );

    const headers = renderer.root.findAll(
      node => node.props.accessibilityRole === 'header' && node.props.children === '하단 메뉴',
    );
    expect(headers.length).toBeGreaterThan(0);
    // VoiceOver는 투명도 0인 요소를 건너뛰므로(기기에서 확인) opacity로 숨기면 안 된다.
    const style = StyleSheet.flatten(headers[0].props.style);
    expect(style.opacity).not.toBe(0);
    expect(style.color).toBe('transparent');
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
