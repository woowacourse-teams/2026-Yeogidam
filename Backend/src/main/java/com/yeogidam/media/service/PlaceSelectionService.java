package com.yeogidam.media.service;

import com.yeogidam.media.domain.MediaShare;
import com.yeogidam.media.dto.request.PlaceDiscardRequest;
import com.yeogidam.media.dto.request.PlaceSelectionRequest;
import com.yeogidam.media.repository.MediaPlaceDao;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class PlaceSelectionService {

    private final InstagramMediaReader instagramMediaReader;
    private final MediaPlaceDao mediaPlaceDao;

    public PlaceSelectionService(
            InstagramMediaReader instagramMediaReader,
            MediaPlaceDao mediaPlaceDao
    ) {
        this.instagramMediaReader = instagramMediaReader;
        this.mediaPlaceDao = mediaPlaceDao;
    }

    @Transactional
    public void createPlaceSelection(
            Long userId,
            Long mediaId,
            PlaceSelectionRequest request
    ) {
        MediaShare mediaShare = instagramMediaReader.readOwnedShare(userId, mediaId);
        mediaShare.decidePlaces(request.placeIds(), PlaceDecisionStatus.SAVED);
        mediaPlaceDao.markSaved(mediaId, request.placeIds());
    }

    @Transactional
    public void createPlaceDiscard(
            Long userId,
            Long mediaId,
            PlaceDiscardRequest request
    ) {
        MediaShare mediaShare = instagramMediaReader.readOwnedShare(userId, mediaId);
        mediaShare.decidePlaces(request.placeIds(), PlaceDecisionStatus.DISCARDED);
        mediaPlaceDao.markDiscarded(mediaId, request.placeIds());
    }
}
