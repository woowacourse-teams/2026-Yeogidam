package com.yeogidam.media.service;

import com.yeogidam.media.domain.SharedInstagramMedia;
import com.yeogidam.media.dto.request.PlaceDiscardRequest;
import com.yeogidam.media.dto.request.PlaceSelectionRequest;
import com.yeogidam.media.repository.SharePlaceDao;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import com.yeogidam.place.domain.SavedPlace;
import com.yeogidam.place.repository.SavedPlaceDao;
import com.yeogidam.place.repository.SavedPlaceRecord;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 저장은 후보 전이와 보관함 반영이 한 트랜잭션이다. 도메인이 실제로 UNDECIDED에서
 * 전이시킨 장소만 보관함으로 가고, 이미 저장된 장소는 last_saved_at만 갱신된다(멱등).
 */
@Service
@Transactional(readOnly = true)
public class PlaceSelectionService {

    private final InstagramMediaReader instagramMediaReader;
    private final SharePlaceDao sharePlaceDao;
    private final SavedPlaceDao savedPlaceDao;

    public PlaceSelectionService(
            InstagramMediaReader instagramMediaReader,
            SharePlaceDao sharePlaceDao,
            SavedPlaceDao savedPlaceDao
    ) {
        this.instagramMediaReader = instagramMediaReader;
        this.sharePlaceDao = sharePlaceDao;
        this.savedPlaceDao = savedPlaceDao;
    }

    @Transactional
    public void createPlaceSelection(
            Long memberId,
            Long shareId,
            PlaceSelectionRequest request
    ) {
        SharedInstagramMedia sharedInstagramMedia = instagramMediaReader.readOwnedShare(memberId, shareId);
        List<Long> savedPlaceIds = sharedInstagramMedia.decidePlaces(request.placeIds(), PlaceDecisionStatus.SAVED);
        sharePlaceDao.markSaved(shareId, savedPlaceIds);
        savedPlaceIds.forEach(placeId -> storeToArchive(memberId, placeId, shareId));
    }

    private void storeToArchive(
            Long memberId,
            Long placeId,
            Long shareId
    ) {
        Long savedPlaceId = savedPlaceDao.findByMemberAndPlace(memberId, placeId)
                .map(this::saveAgain)
                .orElseGet(() -> insertOrSaveExisting(memberId, placeId));
        savedPlaceDao.linkShare(savedPlaceId, shareId);
    }

    private Long saveAgain(SavedPlaceRecord record) {
        SavedPlace savedPlace = new SavedPlace(
                record.id(),
                record.memberId(),
                record.placeId(),
                record.firstSavedAt(),
                record.lastSavedAt());
        savedPlace.saveAgain(LocalDateTime.now());
        savedPlaceDao.updateLastSavedAt(savedPlace.id(), savedPlace.lastSavedAt());
        return savedPlace.id();
    }

    /**
     * 동시 저장이 같은 장소를 함께 넣으려는 경쟁에서, 늦은 쪽은
     * 유니크 위반을 삼키고 먼저 들어간 행의 last_saved_at을 갱신한다.
     */
    private Long insertOrSaveExisting(
            Long memberId,
            Long placeId
    ) {
        SavedPlace savedPlace = new SavedPlace(memberId, placeId, LocalDateTime.now());
        try {
            return savedPlaceDao.insert(savedPlace.memberId(), savedPlace.placeId(), savedPlace.firstSavedAt());
        } catch (DuplicateKeyException exception) {
            return savedPlaceDao.findByMemberAndPlace(memberId, placeId)
                    .map(this::saveAgain)
                    .orElseThrow(() -> exception);
        }
    }

    @Transactional
    public void createPlaceDiscard(
            Long memberId,
            Long shareId,
            PlaceDiscardRequest request
    ) {
        SharedInstagramMedia sharedInstagramMedia = instagramMediaReader.readOwnedShare(memberId, shareId);
        List<Long> discardedPlaceIds = sharedInstagramMedia.decidePlaces(request.placeIds(), PlaceDecisionStatus.DISCARDED);
        sharePlaceDao.markDiscarded(shareId, discardedPlaceIds);
    }
}
