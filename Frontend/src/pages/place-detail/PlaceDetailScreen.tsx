import React, { useCallback, useEffect, useState } from 'react';

import { getPlaceReels } from '../../entities/info/api';
import type { PlaceReel, PlaceReelsApiError } from '../../entities/info/types';
import type { Place } from '../../entities/place/types';
import { CopyToastProvider } from './components/CopyToast';
import { PlaceDetailActionSheet } from './components/PlaceDetailActionSheet';
import { PlaceDetailContent } from './components/PlaceDetailContent';
import { PlaceMapButton } from './components/PlaceMapButton';

type PlaceDetailScreenProps = {
  onBack: () => void;
  place: Place;
  onAuthenticationRequired?: () => void;
};

export function PlaceDetailScreen({
  onBack,
  place,
  onAuthenticationRequired,
}: PlaceDetailScreenProps) {
  const [reels, setReels] = useState<PlaceReel[]>([]);
  const [error, setError] = useState<PlaceReelsApiError | null>(null);
  const [isReelsLoading, setIsReelsLoading] = useState(true);
  const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);

  const loadPosts = useCallback(async () => {
    setIsReelsLoading(true);
    setError(null);
    try {
      setReels(await getPlaceReels(place.id));
    } catch (nextError) {
      const apiError = nextError as PlaceReelsApiError;
      setError(apiError);
      if (apiError.errorCode === 'AUTH401_001') {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsReelsLoading(false);
    }
  }, [onAuthenticationRequired, place.id]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  return (
    <CopyToastProvider>
      <PlaceDetailContent
        onBack={onBack}
        place={place}
        reels={reels}
        reelsError={error}
        isReelsLoading={isReelsLoading}
        onRetryReels={loadPosts}
        onPressMore={() => setIsActionSheetVisible(true)}
      />
      {place.placeUrl ? <PlaceMapButton url={place.placeUrl} /> : null}
      <PlaceDetailActionSheet
        visible={isActionSheetVisible}
        onClose={() => setIsActionSheetVisible(false)}
      />
    </CopyToastProvider>
  );
}
