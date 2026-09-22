package com.yeogidam.place.service;

import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import com.yeogidam.place.repository.SavedPlaceDao;
import java.util.List;
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

    /**
     * 고른 보관함 항목을 한 번에 지운다. 이미 지웠거나 남의 항목이 섞여 있어도 "그 항목이 내 보관함에 없다"는 결과가 같아 멱등하게 204다.
     */
    @Transactional
    public void deleteSavedPlaces(Long memberId, List<Long> savedPlaceIds) {
        if (savedPlaceIds.isEmpty()) {
            throw new PlaceException(PlaceErrorCode.EMPTY_SAVED_PLACE_IDS);
        }
        savedPlaceDao.deleteByMemberAndIds(memberId, savedPlaceIds);
    }
}
