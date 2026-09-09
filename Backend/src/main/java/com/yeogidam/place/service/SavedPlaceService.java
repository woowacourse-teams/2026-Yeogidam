package com.yeogidam.place.service;

import com.yeogidam.media.repository.MediaShareDao;
import com.yeogidam.place.dto.response.PlaceMediaResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import com.yeogidam.place.repository.SavedPlaceDao;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SavedPlaceService {

    private final SavedPlaceDao savedPlaceDao;
    private final MediaShareDao mediaShareDao;

    public SavedPlaceService(
            SavedPlaceDao savedPlaceDao,
            MediaShareDao mediaShareDao
    ) {
        this.savedPlaceDao = savedPlaceDao;
        this.mediaShareDao = mediaShareDao;
    }

    public SavedPlaceResponses readSavedPlaces(Long memberId) {
        return SavedPlaceResponses.from(savedPlaceDao.findAllViewsByMemberId(memberId));
    }

    public PlaceMediaResponses readSavedPlaceMedia(
            Long memberId,
            Long placeId
    ) {
        validateSavedForMember(memberId, placeId);
        return PlaceMediaResponses.from(mediaShareDao.findAllSavedByPlaceForMember(memberId, placeId));
    }

    /**
     * 보관함 행과 연결만 지운다. 지나간 공유의 후보를 되살리지 않는다(ADR-02 결정 6).
     */
    @Transactional
    public void deleteSavedPlace(
            Long memberId,
            Long placeId
    ) {
        validateSavedForMember(memberId, placeId);
        savedPlaceDao.deleteByMemberAndPlace(memberId, placeId);
    }

    private void validateSavedForMember(
            Long memberId,
            Long placeId
    ) {
        if (!savedPlaceDao.existsByMemberAndPlace(memberId, placeId)) {
            throw new PlaceException(PlaceErrorCode.SAVED_PLACE_NOT_FOUND);
        }
    }
}
