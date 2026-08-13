import React from 'react';

import {placePostMocks} from '../../entities/place-post/mocks';
import {placeMocks} from '../../entities/place/mocks';
import {CopyToastProvider} from './components/CopyToast';
import {PlaceDetailContent} from './components/PlaceDetailContent';
import {PlaceMapButton} from './components/PlaceMapButton';

type PlaceDetailScreenProps = {
  onBack: () => void;
};

export function PlaceDetailScreen({onBack}: PlaceDetailScreenProps) {
  const place = placeMocks[0];
  const posts = placePostMocks.filter(post => post.placeId === place.id);

  return (
    <CopyToastProvider>
      <PlaceDetailContent
        onBack={onBack}
        place={place}
        posts={posts}
      />
      {place.placeUrl ? <PlaceMapButton url={place.placeUrl} /> : null}
    </CopyToastProvider>
  );
}
