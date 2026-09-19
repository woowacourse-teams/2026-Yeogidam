package com.yeogidam.place.service;

import com.yeogidam.place.dto.response.SavedPlaceResponse;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.repository.SavedPlaceDao;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
@RequiredArgsConstructor
public class SavedPlaceService {

    private final SavedPlaceDao savedPlaceDao;

    public SavedPlaceResponses readSavedPlaces(Long memberId) {
        List<SavedPlaceResponse> savedPlaces = savedPlaceDao.findAllByMember(memberId)
                .stream()
                .map(SavedPlaceResponse::new)
                .toList();
        return new SavedPlaceResponses(savedPlaces);
    }
}
