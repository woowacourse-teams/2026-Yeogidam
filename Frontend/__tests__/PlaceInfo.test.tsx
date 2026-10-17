import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type { SavedPlaceViewContext } from '../src/analytics/savedPlaceEvents';
import type { Place } from '../src/entities/place/types';
import { CopyToastProvider } from '../src/pages/place-detail/components/CopyToast';
import { PlaceInfo } from '../src/pages/place-detail/components/PlaceInfo';
import { renderTracked } from './support/renderers';

const mockCapture = jest.fn();

jest.mock('posthog-react-native', () => ({
  usePostHog: () => ({ capture: mockCapture }),
}));

const viewContext: SavedPlaceViewContext = {
  placeId: 'place-1',
  savedPlaceId: 'saved-place-1',
  placeViewId: 'view-1',
  source: 'saved_places_grid',
};

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
  image: { uri: 'https://example.com/place.png' },
};

let openURLSpy: jest.SpyInstance<
  ReturnType<typeof Linking.openURL>,
  Parameters<typeof Linking.openURL>
>;

// 링크 열기는 beforeEach가 한 번 가로채고, 열기 결과는 테스트마다 정합니다. describe 안이 아니라 파일 맨 위에 두어
// setupFilesAfterEnv가 그린 화면을 내린 뒤에 되돌립니다.
beforeEach(() => {
  openURLSpy = jest.spyOn(Linking, 'openURL');
});

// 단언이 중간에 실패해도 테스트가 정한 열기 결과가 다음 테스트로 넘어가지 않게 되돌립니다. Linking.openURL은
// jest preset의 jest.fn()이라 spyOn이 같은 mock을 돌려주고, mockRestore가 정한 구현을 지워 preset 상태(구현 없음)로 되돌립니다.
afterEach(() => {
  openURLSpy.mockRestore();
});

describe('PlaceInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('opens the Kakao Map link and records the saved place event', async () => {
    openURLSpy.mockResolvedValue(undefined);
    const renderer = await renderTracked(
      <CopyToastProvider>
        <PlaceInfo place={place} viewContext={viewContext} />
      </CopyToastProvider>,
    );

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '테스트 카페 카카오맵 열기' })
        .props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://map.kakao.com/example',
    );
    expect(mockCapture).toHaveBeenCalledWith(
      'place_map_viewed',
      expect.objectContaining({
        place_id: 'place-1',
        saved_place_id: 'saved-place-1',
        place_view_id: 'view-1',
        source: 'saved_places_grid',
        map_provider: 'kakao',
      }),
    );
  });

  test('does not record the event when all Kakao Map links fail to open', async () => {
    openURLSpy.mockRejectedValue(new Error('open failed'));
    const renderer = await renderTracked(
      <CopyToastProvider>
        <PlaceInfo place={place} viewContext={viewContext} />
      </CopyToastProvider>,
    );

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: '테스트 카페 카카오맵 열기' })
        .props.onPress();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });

    expect(mockCapture).not.toHaveBeenCalled();
  });
});
