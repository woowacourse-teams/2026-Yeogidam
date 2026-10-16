import {useCallback, useState} from 'react';

import {ONBOARDING_PLACES} from '../entities/onboarding/data';
import type {Place} from '../entities/place/types';

/**
 * 비회원이 둘러보는 체험(시드) 장소입니다. 지운 장소는 메모리에만 남기고 저장하지 않으며,
 * 회원이 되면 resetGuestPlaces로 시드로 되돌려 다음 비회원 진입 때 처음 상태를 보입니다.
 */
export function useGuestSeedPlaces() {
  const [guestPlaces, setGuestPlaces] = useState<Place[]>(ONBOARDING_PLACES);

  const deleteGuestPlaces = useCallback((placeIds: string[]) => {
    const deletedIds = new Set(placeIds);
    setGuestPlaces(current => current.filter(place => !deletedIds.has(place.id)));
  }, []);

  const resetGuestPlaces = useCallback(() => {
    setGuestPlaces(ONBOARDING_PLACES);
  }, []);

  return {guestPlaces, deleteGuestPlaces, resetGuestPlaces};
}
