package com.yeogidam.place.service;

import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import com.yeogidam.place.repository.SavedPlaceDao;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedPlaceService {

    private final SavedPlaceDao savedPlaceDao;

    public SavedPlaceResponses readSavedPlaces(Long memberId) {
        return SavedPlaceResponses.from(savedPlaceDao.findAllByMember(memberId));
    }

    @Transactional
    public void deleteSavedPlace(Long memberId, Long placeId) {
        int deleted = savedPlaceDao.deleteByMemberAndPlace(memberId, placeId);
        if (deleted == 0) {
            throw new PlaceException(PlaceErrorCode.SAVED_PLACE_NOT_FOUND);
        }
    }
}
