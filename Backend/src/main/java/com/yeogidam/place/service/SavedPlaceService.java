package com.yeogidam.place.service;

import com.yeogidam.place.dto.response.SavedPlaceResponses;
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
}
