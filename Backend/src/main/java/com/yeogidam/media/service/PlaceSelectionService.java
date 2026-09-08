package com.yeogidam.media.service;

import com.yeogidam.media.domain.MediaShare;
import com.yeogidam.media.dto.request.PlaceDiscardRequest;
import com.yeogidam.media.dto.request.PlaceSelectionRequest;
import com.yeogidam.media.repository.SharePlaceDao;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class PlaceSelectionService {

    private final InstagramMediaReader instagramMediaReader;
    private final SharePlaceDao sharePlaceDao;

    public PlaceSelectionService(
            InstagramMediaReader instagramMediaReader,
            SharePlaceDao sharePlaceDao
    ) {
        this.instagramMediaReader = instagramMediaReader;
        this.sharePlaceDao = sharePlaceDao;
    }

    @Transactional
    public void createPlaceSelection(
            Long userId,
            Long shareId,
            PlaceSelectionRequest request
    ) {
        MediaShare mediaShare = instagramMediaReader.readOwnedShare(userId, shareId);
        mediaShare.decidePlaces(request.placeIds(), PlaceDecisionStatus.SAVED);
        sharePlaceDao.markSaved(shareId, request.placeIds());
    }

    @Transactional
    public void createPlaceDiscard(
            Long userId,
            Long shareId,
            PlaceDiscardRequest request
    ) {
        MediaShare mediaShare = instagramMediaReader.readOwnedShare(userId, shareId);
        mediaShare.decidePlaces(request.placeIds(), PlaceDecisionStatus.DISCARDED);
        sharePlaceDao.markDiscarded(shareId, request.placeIds());
    }
}
