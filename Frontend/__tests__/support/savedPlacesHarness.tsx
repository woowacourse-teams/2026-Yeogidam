import React from 'react';
import {Alert, RefreshControl, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {getReelProcessingStatus, saveContent} from '../../src/entities/content/api';
import {getHistoryReels} from '../../src/entities/content/history-api';
import {deleteSavedPlaces, getSavedPlaces} from '../../src/entities/info/api';
import type {SavedPlaceListItem} from '../../src/entities/info/types';
import type {Place} from '../../src/entities/place/types';
import {setSharedSaveState} from '../../src/lib/reel-save-state';
import {getRecentSearches, setRecentSearches} from '../../src/lib/searchHistoryStorage';
import {SavedPlaceGrid} from '../../src/pages/saved-places/components/SavedPlaceGrid';
import {SavedPlacesHeader} from '../../src/pages/saved-places/components/SavedPlacesHeader';
import {SavedPlacesLinkDialog} from '../../src/pages/saved-places/components/SavedPlacesLinkDialog';
import {SavedPlacesSearchPanel} from '../../src/pages/saved-places/components/SavedPlacesSearchPanel';
import {clearSavedPlacesCache} from '../../src/entities/info/saved-places-cache';
import {SavedPlacesScreen} from '../../src/pages/saved-places/SavedPlacesScreen';
import {LINK, listing, NOW} from './savedPlacesFixtures';
import {renderTracked, settleAsyncWork, type Renderer} from './renderers';

// 보관함 화면 테스트들이 함께 쓰는 렌더, 시간 진행, 조작 도우미와 테스트마다의 준비, 정리입니다.
// 여기서 부르는 API와 저장소 모듈은 테스트 파일이 jest.mock으로 바꿔 둬야 합니다.
// jest.mock은 선언한 파일의 맨 위로 끌어올려지므로 각 테스트 파일에 둡니다.
// 그린 화면은 renderTracked로 기록해 setupFilesAfterEnv가 내리므로 여기서는 내리지 않습니다.

export {settleAsyncWork, unmountTracked, type Renderer} from './renderers';
type ScreenProps = React.ComponentProps<typeof SavedPlacesScreen>;

export const act = ReactTestRenderer.act;
let alertSpy: jest.SpyInstance<void, Parameters<typeof Alert.alert>>;

export async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

export function render(props: Partial<ScreenProps> = {}) {
  return renderTracked(<SavedPlacesScreen onOpenDetail={jest.fn()} {...props} />);
}

export async function renderLoaded(items: SavedPlaceListItem[], props: Partial<ScreenProps> = {}) {
  jest.mocked(getSavedPlaces).mockResolvedValue(items);
  const renderer = await render(props);
  await settleAsyncWork();
  return renderer;
}

export const grid = (renderer: Renderer) => renderer.root.findByType(SavedPlaceGrid);
export const placeNames = (renderer: Renderer) =>
  grid(renderer).props.places.map((place: Place) => place.name);
export const placeNamed = (renderer: Renderer, name: string): Place =>
  grid(renderer).props.places.find((place: Place) => place.name === name);
export const dialog = (renderer: Renderer) => renderer.root.findByType(SavedPlacesLinkDialog);
export const header = (renderer: Renderer) => renderer.root.findByType(SavedPlacesHeader);
export const searchPanel = (renderer: Renderer) => renderer.root.findByType(SavedPlacesSearchPanel);
export const refreshControl = (renderer: Renderer) => renderer.root.findByType(RefreshControl);
/** 편집 중 화면 아래에 뜨는 삭제(또는 편집 취소) 버튼입니다. 이 버튼만 disabled를 받습니다. */
export const deleteAction = (renderer: Renderer) =>
  renderer.root.findAll(
    node => typeof node.props.onPress === 'function' && typeof node.props.disabled === 'boolean',
  )[0];
export const texts = (renderer: Renderer): string[] =>
  renderer.root
    .findAllByType(Text)
    .flatMap(node => React.Children.toArray(node.props.children))
    .filter((child): child is string => typeof child === 'string');

export async function pressLabel(renderer: Renderer, label: string) {
  const [target] = renderer.root.findAll(
    node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function',
  );
  await act(async () => {
    target.props.onPress();
  });
  await settleAsyncWork();
}

/** 글자나 아이콘을 감싼 가장 가까운 누를 수 있는 요소를 누릅니다. */
export async function pressAround(
  renderer: Renderer,
  matches: (props: Record<string, unknown>) => boolean,
) {
  let target: ReactTestRenderer.ReactTestInstance | null =
    renderer.root.findAll(node => matches(node.props))[0] ?? null;
  while (target && typeof target.props.onPress !== 'function') target = target.parent;
  await act(async () => {
    target?.props.onPress();
  });
  await settleAsyncWork();
}

export const pressText = (renderer: Renderer, label: string) =>
  pressAround(renderer, props => props.children === label);

/** 마지막으로 띄운 삭제 확인 창에서 '삭제'를 누릅니다. */
export async function confirmDeleteAlert() {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2];
  await act(async () => {
    buttons?.find(button => button.text === '삭제')?.onPress?.();
  });
  await settleAsyncWork();
}

export async function selectAndDelete(renderer: Renderer, placeId: string) {
  await pressLabel(renderer, '보관함 편집');
  await act(async () => grid(renderer).props.onTogglePlaceSelection(placeId));
  await pressLabel(renderer, '선택한 장소 삭제하기');
  await confirmDeleteAlert();
}

export async function openDialogAndSave(renderer: Renderer, value = LINK) {
  await pressLabel(renderer, '장소 링크 추가');
  await act(async () => dialog(renderer).props.onChangeValue(value));
  await act(async () => {
    await dialog(renderer).props.onSubmit();
  });
  await settleAsyncWork();
}

/**
 * 테스트 파일 맨 위에서 한 번 부릅니다. 테스트마다 가짜 시계와 mock 기본값, 공유 저장 상태,
 * 보관함 목록 캐시를 처음 상태로 되돌립니다. 테스트가 끝나면 setupFilesAfterEnv가 그린 화면을 먼저 내리고,
 * 여기서 공유 저장 상태와 가로챈 Alert와 가짜 시계를 되돌립니다. 맨 위가 아니라 describe 안에서 부르면 화면보다 먼저 되돌리게 됩니다.
 */
export function setUpSavedPlacesScreenTests() {
  beforeEach(async () => {
    jest.useFakeTimers({now: NOW});
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.mocked(getSavedPlaces).mockReset().mockResolvedValue([]);
    jest.mocked(deleteSavedPlaces).mockReset().mockResolvedValue(undefined);
    jest.mocked(saveContent).mockReset().mockResolvedValue({
      reelId: '8',
      status: 'PROCESSING',
      reused: false,
    });
    jest.mocked(getReelProcessingStatus).mockReset().mockResolvedValue(null);
    jest.mocked(getHistoryReels).mockReset().mockResolvedValue(listing());
    jest.mocked(getRecentSearches).mockReset().mockResolvedValue([]);
    jest.mocked(setRecentSearches).mockReset().mockResolvedValue(undefined);
    setSharedSaveState(null);
    clearSavedPlacesCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    setSharedSaveState(null);
    alertSpy.mockRestore();
    jest.clearAllTimers();
    jest.useRealTimers();
  });
}
