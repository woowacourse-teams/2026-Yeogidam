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

    /**
     * 공유에서 찾은 장소를 회원 보관함에 저장하고 공유와 연결한다.
     * 장소 ID 오름차순으로 저장해서, 같은 회원의 다른 저장이나 게시글 삭제와 보관함 항목을 같은 순서로 잠근다.
     */
    @Transactional
    public void savePlacesFromShare(Long memberId, Long sharedMediaId, List<Long> placeIds) {
        if (placeIds.isEmpty()) {
            return;
        }
        Instant savedAt = clock.instant();
        for (Long placeId : placeIds.stream().sorted().toList()) {
            SavedPlace savedPlace = new SavedPlace(memberId, placeId, savedAt);
            savedPlaceDao.saveOrUpdate(savedPlace);
            Long savedPlaceId = savedPlaceDao.getIdByMemberAndPlaceForUpdate(memberId, placeId);
            savedPlaceDao.saveShareIfAbsent(savedPlaceId, sharedMediaId, savedAt);
        }
    }
}
