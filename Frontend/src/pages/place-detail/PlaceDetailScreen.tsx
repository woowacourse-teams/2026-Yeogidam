import React from 'react';

import {placePostMocks} from '../../entities/place-post/mocks';
import type {Place} from '../../entities/place/types';
import {CopyToastProvider} from './components/CopyToast';
import {PlaceDetailContent} from './components/PlaceDetailContent';
import {PlaceMapButton} from './components/PlaceMapButton';

type PlaceDetailScreenProps = {
  onBack: () => void;
  place: Place;
};

export function PlaceDetailScreen({onBack, place}: PlaceDetailScreenProps) {
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
