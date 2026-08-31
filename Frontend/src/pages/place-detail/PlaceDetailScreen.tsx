import React, { useCallback, useEffect, useState } from 'react';

import { deleteSavedPlaces, getPlaceReels, getSavedPlaces } from '../../entities/info/api';
import type {
  PlaceReel,
  PlaceReelsApiError,
  SavedPlacesApiError,
} from '../../entities/info/types';
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<SavedPlacesApiError | null>(null);

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

  const handleDelete = useCallback(async () => {
    if (isDeleting) {
      return;
    }
    if (!place.savedPlaceId) {
      setDeleteError({
        status: 400,
        errorCode: 'COMMON400_001',
        message: '요청 내용을 확인해주세요.',
        retryable: false,
      });
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteSavedPlaces([place.savedPlaceId]);
      setIsActionSheetVisible(false);
      onBack();
    } catch (nextError) {
      const apiError = nextError as SavedPlacesApiError;
      if (apiError.errorCode === 'CLIENT000_002') {
        try {
          const savedPlaces = await getSavedPlaces();
          if (!savedPlaces.some(savedPlace => savedPlace.id === place.savedPlaceId)) {
            setIsActionSheetVisible(false);
            onBack();
            return;
          }
        } catch {
          // Keep the original timeout error and allow the user to retry.
        }
      }

      setDeleteError(apiError);
      if (apiError.errorCode === 'AUTH401_001' || apiError.errorCode === 'AUTH401_002') {
        onAuthenticationRequired?.();
      }
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, onAuthenticationRequired, onBack, place.savedPlaceId]);

  return (
    <CopyToastProvider>
      <PlaceDetailContent
        onBack={onBack}
        place={place}
        reels={reels}
        reelsError={error}
        isReelsLoading={isReelsLoading}
        onRetryReels={loadPosts}
        onPressMore={() => {
          setDeleteError(null);
          setIsActionSheetVisible(true);
        }}
      />
      {place.placeUrl ? <PlaceMapButton url={place.placeUrl} /> : null}
      <PlaceDetailActionSheet
        visible={isActionSheetVisible}
        onClose={() => {
          setDeleteError(null);
          setIsActionSheetVisible(false);
        }}
        onDelete={handleDelete}
        isDeleting={isDeleting}
        deleteError={deleteError}
      />
    </CopyToastProvider>
  );
}
