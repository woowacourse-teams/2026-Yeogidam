import React from 'react';
import { Linking } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type { SavedPlaceViewContext } from '../src/analytics/savedPlaceEvents';
import type { Place } from '../src/entities/place/types';
import { CopyToastProvider } from '../src/pages/place-detail/components/CopyToast';
import { PlaceInfo } from '../src/pages/place-detail/components/PlaceInfo';

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

describe('PlaceInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('opens the Kakao Map link and records the saved place event', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <CopyToastProvider>
          <PlaceInfo place={place} viewContext={viewContext} />
        </CopyToastProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      renderer!.root
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

    await ReactTestRenderer.act(async () => {
      renderer!.unmount();
    });
  });

  test('does not record the event when all Kakao Map links fail to open', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('open failed'));
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <CopyToastProvider>
          <PlaceInfo place={place} viewContext={viewContext} />
        </CopyToastProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      renderer!.root
        .findByProps({ accessibilityLabel: '테스트 카페 카카오맵 열기' })
        .props.onPress();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    });

    expect(mockCapture).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer!.unmount();
    });
  });
});
