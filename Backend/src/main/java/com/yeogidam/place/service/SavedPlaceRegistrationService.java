package com.yeogidam.place.service;

import com.yeogidam.place.domain.SavedPlace;
import com.yeogidam.place.repository.SavedPlaceDao;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 공유된 장소를 회원 보관함에 등록한다. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedPlaceRegistrationService {

    private final Clock clock;
    private final SavedPlaceDao savedPlaceDao;

    @Transactional
    public void savePlacesFromShare(Long memberId, Long sharedMediaId, List<Long> placeIds) {
        if (placeIds.isEmpty()) {
            return;
        }
        Instant savedAt = clock.instant();
        for (Long placeId : placeIds) {
            SavedPlace savedPlace = new SavedPlace(memberId, placeId, savedAt);
            savedPlaceDao.saveOrUpdate(savedPlace);
            Long savedPlaceId = savedPlaceDao.getIdByMemberAndPlace(memberId, placeId);
            savedPlaceDao.saveShareIfAbsent(savedPlaceId, sharedMediaId, savedAt);
        }
    }
}
