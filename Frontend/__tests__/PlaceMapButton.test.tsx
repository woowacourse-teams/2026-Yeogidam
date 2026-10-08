import React from 'react';
import {Linking} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {PlaceMapButton} from '../src/pages/place-detail/components/PlaceMapButton';

const mockCapture = jest.fn();

jest.mock('posthog-react-native', () => ({
  usePostHog: () => ({capture: mockCapture}),
}));

const viewContext = {
  placeId: 'place-1',
  savedPlaceId: 'saved-place-1',
  placeViewId: 'view-1',
  source: 'saved_places_grid' as const,
};

describe('PlaceMapButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('captures map usage after the map URL opens', async () => {
    jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PlaceMapButton
          savedAt="2026-09-28T00:00:00.000Z"
          url="https://map.kakao.com/example"
          viewContext={viewContext}
        />,
      );
    });

    await ReactTestRenderer.act(async () => {
      await renderer!.root
        .findByProps({accessibilityLabel: '카카오맵으로 바로가기'})
        .props.onPress();
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

  test('does not capture map usage when opening the map URL fails', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('open failed'));
    let renderer: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <PlaceMapButton
          savedAt="2026-09-28T00:00:00.000Z"
          url="https://map.kakao.com/example"
          viewContext={viewContext}
        />,
      );
    });

    await ReactTestRenderer.act(async () => {
      await renderer!.root
        .findByProps({accessibilityLabel: '카카오맵으로 바로가기'})
        .props.onPress();
    });

    expect(mockCapture).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      renderer!.unmount();
    });
  });
});
