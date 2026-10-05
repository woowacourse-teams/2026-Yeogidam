package com.yeogidam.media.share.service;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.share.domain.PlaceCandidate;
import com.yeogidam.media.share.domain.PlaceCandidates;
import com.yeogidam.media.share.dto.request.PlaceDecisionRequest;
import com.yeogidam.media.share.repository.PlaceCandidateDao;
import com.yeogidam.media.share.repository.SharedMediaDao;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import com.yeogidam.place.domain.SavedPlace;
import com.yeogidam.place.repository.SavedPlaceDao;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlaceDecisionService {

    private final SharedMediaDao sharedMediaDao;
    private final PlaceCandidateDao placeCandidateDao;
    private final SavedPlaceDao savedPlaceDao;
    private final Clock clock;

    @Transactional
    public void createPlaceDecisions(
            Long memberId,
            Long sharedMediaId,
            PlaceDecisionRequest request
    ) {
        validateOwner(memberId, sharedMediaId);
        PlaceCandidates candidates = readCandidates(sharedMediaId);
        PlaceDecisionStatus decision = PlaceDecisionStatus.valueOf(request.decision());
        List<Long> decidedPlaceIds = candidates.decide(request.placeIds(), decision);
        Instant decidedAt = clock.instant();
        placeCandidateDao.updateDecisions(sharedMediaId, decidedPlaceIds, decision, decidedAt);
        if (decision == PlaceDecisionStatus.SAVED) {
            decidedPlaceIds.forEach(placeId -> savePlaceAndLink(memberId, sharedMediaId, placeId, decidedAt));
        }
    }

    private void validateOwner(Long memberId, Long sharedMediaId) {
        if (!sharedMediaDao.existsByMemberIdAndSharedMediaId(memberId, sharedMediaId)) {
            throw new MediaException(MediaErrorCode.SHARED_MEDIA_NOT_FOUND);
        }
    }

    private PlaceCandidates readCandidates(Long sharedMediaId) {
        List<PlaceCandidate> candidates = placeCandidateDao.findAllBySharedMediaId(sharedMediaId);
        if (candidates.isEmpty()) {
            throw new MediaException(MediaErrorCode.EXTRACTION_NOT_FINISHED);
        }
        return new PlaceCandidates(candidates);
    }

    private void savePlaceAndLink(
            Long memberId,
            Long sharedMediaId,
            Long placeId,
            Instant savedAt
    ) {
        Long savedPlaceId = savePlace(memberId, placeId, savedAt);
        savedPlaceDao.saveShare(savedPlaceId, sharedMediaId, savedAt);
    }

    private Long savePlace(
            Long memberId,
            Long placeId,
            Instant savedAt
    ) {
        SavedPlace savedPlace = savedPlaceDao.findByMemberAndPlace(memberId, placeId)
                .orElseGet(() -> new SavedPlace(memberId, placeId, savedAt));
        if (savedPlace.id() == null) {
            return savedPlaceDao.save(savedPlace);
        }
        savedPlace.saveAgain(savedAt);
        savedPlaceDao.update(savedPlace);
        return savedPlace.id();
    }
}
