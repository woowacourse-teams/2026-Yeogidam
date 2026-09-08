package com.yeogidam.media.service;

import com.yeogidam.media.domain.PlaceCandidate;
import com.yeogidam.media.domain.PlaceCandidates;
import com.yeogidam.media.domain.Extraction;
import com.yeogidam.media.domain.ExtractionFailureReason;
import com.yeogidam.media.domain.ExtractionStatus;
import com.yeogidam.media.domain.InstagramMedia;
import com.yeogidam.media.domain.InstagramUrl;
import com.yeogidam.media.domain.MediaMetadata;
import com.yeogidam.media.domain.MediaShare;
import com.yeogidam.media.domain.MediaShortcode;
import com.yeogidam.media.domain.OwnerId;
import com.yeogidam.media.domain.ExtractedPlaces;
import com.yeogidam.media.exception.InstagramMediaNotFoundException;
import com.yeogidam.media.repository.InstagramMediaDao;
import com.yeogidam.media.repository.InstagramMediaRecord;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.place.domain.PlaceThumbnail;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.repository.PlaceDecisionView;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * DB 표현(InstagramMediaRecord, media_place, place)을 도메인으로 되살린다.
 * 한 record에서 게시물(InstagramMedia)과 공유 사건(MediaShare)을 각각 조립한다.
 * 아직 옛 스키마(사용자마다 행 하나)라 공유 사건의 id와 mediaId가 같은 값이다.
 */
@Component
public class InstagramMediaReader {

    private final InstagramMediaDao instagramMediaDao;
    private final PlaceDao placeDao;

    public InstagramMediaReader(
            InstagramMediaDao instagramMediaDao,
            PlaceDao placeDao
    ) {
        this.instagramMediaDao = instagramMediaDao;
        this.placeDao = placeDao;
    }

    public InstagramMediaRecord readRecord(Long mediaId) {
        return instagramMediaDao.findById(mediaId)
                .orElseThrow(InstagramMediaNotFoundException::new);
    }

    public InstagramMediaRecord readOwnedRecord(
            Long userId,
            Long mediaId
    ) {
        InstagramMediaRecord record = readRecord(mediaId);
        if (!record.userId().equals(userId)) {
            throw new InstagramMediaNotFoundException();
        }
        return record;
    }

    public InstagramMedia readOwned(
            Long userId,
            Long mediaId
    ) {
        readOwnedRecord(userId, mediaId);
        return read(mediaId);
    }

    public InstagramMedia read(Long mediaId) {
        InstagramMediaRecord record = readRecord(mediaId);
        return new InstagramMedia(
                record.id(),
                new MediaShortcode(record.mediaShortcode()),
                new MediaMetadata(record.title(), record.caption(), record.thumbnailUrl(), record.authorUsername()),
                toExtraction(record));
    }

    public MediaShare readOwnedShare(
            Long userId,
            Long mediaId
    ) {
        InstagramMediaRecord record = readOwnedRecord(userId, mediaId);
        return new MediaShare(
                record.id(),
                new OwnerId(record.userId()),
                record.id(),
                new InstagramUrl(record.sharedUrl()),
                toCandidates(record));
    }

    private PlaceCandidates toCandidates(InstagramMediaRecord record) {
        if (ExtractionStatus.valueOf(record.extractionStatus()) != ExtractionStatus.SUCCEEDED) {
            return null;
        }
        return new PlaceCandidates(readCandidates(record.id()));
    }

    private List<PlaceCandidate> readCandidates(Long mediaId) {
        return placeDao.findAllByMediaId(mediaId).stream()
                .map(this::toExtractedPlace)
                .toList();
    }

    private PlaceCandidate toExtractedPlace(PlaceDecisionView view) {
        return new PlaceCandidate(toPlace(view), PlaceDecisionStatus.valueOf(view.decisionStatus()));
    }

    private Extraction toExtraction(InstagramMediaRecord record) {
        ExtractionStatus status = ExtractionStatus.valueOf(record.extractionStatus());
        return status.toExtraction(
                () -> new ExtractedPlaces(readPlaceFacts(record.id())),
                () -> ExtractionFailureReason.valueOf(record.failureReason()));
    }

    private List<Place> readPlaceFacts(Long mediaId) {
        return placeDao.findAllByMediaId(mediaId).stream()
                .map(this::toPlace)
                .toList();
    }

    private Place toPlace(PlaceDecisionView view) {
        PlaceProfile profile = new PlaceProfile(
                new PlaceName(view.name()),
                new Address(view.address(), view.roadAddress()),
                new Coordinate(view.latitude(), view.longitude()),
                view.category(),
                view.telephone(),
                new PlaceThumbnail(view.thumbnailUrl(), null, null));
        PlaceExternalSource externalSource = new PlaceExternalSource(view.kakaoPlaceId(), view.kakaoPlaceUrl());
        return new Place(view.placeId(), externalSource, profile);
    }
}
