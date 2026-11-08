package com.yeogidam.place.service;

import com.yeogidam.place.domain.SavedPlace;
import com.yeogidam.place.repository.SavedPlaceDao;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
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
            SavedPlaceSaveResult result = save(memberId, placeId, savedAt);
            savedPlaceDao.saveShareIfAbsent(result.savedPlaceId(), sharedMediaId, savedAt);
        }
    }

    /**
     * 체크 켜기에서 고른 장소 하나를 보관함에 없을 때만 저장하고 요청한 공유와 연결한다. 이미 있으면 아무것도 바꾸지 않고 있던 항목의 ID를 돌려준다.
     * 있는지 확인한 뒤 저장하기 전에 다른 요청이 같은 장소를 먼저 넣었으면, 저장 시각만 바뀌고 공유와는 연결하지 않으며 새로 저장하지 않은 것으로 돌려준다.
     */
    @Transactional
    public SavedPlaceSaveResult savePlaceIfAbsent(Long memberId, Long sharedMediaId, Long placeId) {
        Optional<Long> savedPlaceId = savedPlaceDao.findIdByMemberAndPlaceForUpdate(memberId, placeId);
        if (savedPlaceId.isPresent()) {
            return new SavedPlaceSaveResult(savedPlaceId.get(), false);
        }
        Instant savedAt = clock.instant();
        SavedPlaceSaveResult result = save(memberId, placeId, savedAt);
        if (result.isCreated()) {
            savedPlaceDao.saveShareIfAbsent(result.savedPlaceId(), sharedMediaId, savedAt);
        }
        return result;
    }

    private SavedPlaceSaveResult save(Long memberId, Long placeId, Instant savedAt) {
        boolean isCreated = savedPlaceDao.saveOrUpdate(new SavedPlace(memberId, placeId, savedAt));
        Long savedPlaceId = savedPlaceDao.findIdByMemberAndPlaceForUpdate(memberId, placeId)
                .orElseThrow(() -> new IllegalStateException("저장한 보관함 항목을 찾을 수 없습니다."));
        return new SavedPlaceSaveResult(savedPlaceId, isCreated);
    }
}
