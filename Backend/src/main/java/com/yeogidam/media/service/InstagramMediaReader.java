package com.yeogidam.media.service;

import com.yeogidam.media.domain.Extraction;
import com.yeogidam.media.domain.ExtractedPlaces;
import com.yeogidam.media.domain.ExtractionFailureReason;
import com.yeogidam.media.domain.ExtractionStatus;
import com.yeogidam.media.domain.InstagramMedia;
import com.yeogidam.media.domain.InstagramUrl;
import com.yeogidam.media.domain.MediaMetadata;
import com.yeogidam.media.domain.MediaShare;
import com.yeogidam.media.domain.MediaShortcode;
import com.yeogidam.media.domain.OwnerId;
import com.yeogidam.media.domain.PlaceCandidate;
import com.yeogidam.media.domain.PlaceCandidates;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.repository.InstagramMediaDao;
import com.yeogidam.media.repository.InstagramMediaRecord;
import com.yeogidam.media.repository.MediaShareDao;
import com.yeogidam.media.repository.MediaShareProjection;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.place.domain.PlaceThumbnail;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.repository.PlaceDecisionProjection;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * DB 표현(instagram_media, media_share, share_place, place)을 도메인으로 되살린다.
 * 게시물(InstagramMedia)은 media 행에서, 공유 사건(MediaShare)은 share 행과 후보에서 조립하며
 * 소유 검증은 공유 사건 기준이다(남의 공유는 존재 자체를 숨긴다).
 */
@Component
public class InstagramMediaReader {

    private final InstagramMediaDao instagramMediaDao;
    private final MediaShareDao mediaShareDao;
    private final PlaceDao placeDao;

    public InstagramMediaReader(
            InstagramMediaDao instagramMediaDao,
            MediaShareDao mediaShareDao,
            PlaceDao placeDao
    ) {
        this.instagramMediaDao = instagramMediaDao;
        this.mediaShareDao = mediaShareDao;
        this.placeDao = placeDao;
    }

    public MediaShareProjection readOwnedShareView(
            Long memberId,
            Long shareId
    ) {
        MediaShareProjection projection = mediaShareDao.findViewById(shareId)
                .orElseThrow(() -> new MediaException(MediaErrorCode.NOT_FOUND));
        if (!projection.memberId().equals(memberId)) {
            throw new MediaException(MediaErrorCode.NOT_FOUND);
        }
        return projection;
    }

    public MediaShare readOwnedShare(
            Long memberId,
            Long shareId
    ) {
        MediaShareProjection projection = readOwnedShareView(memberId, shareId);
        return new MediaShare(
                projection.shareId(),
                new OwnerId(projection.memberId()),
                projection.mediaId(),
                new InstagramUrl(projection.sharedUrl()),
                toCandidates(projection));
    }

    private PlaceCandidates toCandidates(MediaShareProjection projection) {
        if (ExtractionStatus.valueOf(projection.extractionStatus()) != ExtractionStatus.SUCCEEDED) {
            return null;
        }
        return new PlaceCandidates(readCandidates(projection.shareId()));
    }

    private List<PlaceCandidate> readCandidates(Long shareId) {
        return placeDao.findAllByShareId(shareId).stream()
                .map(this::toPlaceCandidate)
                .toList();
    }

    private PlaceCandidate toPlaceCandidate(PlaceDecisionProjection projection) {
        return new PlaceCandidate(toPlace(projection), PlaceDecisionStatus.valueOf(projection.decisionStatus()));
    }

    public InstagramMedia read(Long mediaId) {
        InstagramMediaRecord record = instagramMediaDao.findById(mediaId)
                .orElseThrow(() -> new MediaException(MediaErrorCode.NOT_FOUND));
        return new InstagramMedia(
                record.id(),
                new MediaShortcode(record.mediaShortcode()),
                new MediaMetadata(record.title(), record.caption(), record.thumbnailUrl(), record.authorUsername()),
                toExtraction(record));
    }

    private Extraction toExtraction(InstagramMediaRecord record) {
        ExtractionStatus status = ExtractionStatus.valueOf(record.extractionStatus());
        return status.toExtraction(
                () -> new ExtractedPlaces(readPlaceFacts(record.id())),
                () -> ExtractionFailureReason.valueOf(record.failureReason()));
    }

    private List<Place> readPlaceFacts(Long mediaId) {
        return placeDao.findAllFactsByMediaId(mediaId).stream()
                .map(this::toPlace)
                .toList();
    }

    private Place toPlace(PlaceDecisionProjection projection) {
        PlaceProfile profile = new PlaceProfile(
                new PlaceName(projection.name()),
                new Address(projection.address(), projection.roadAddress()),
                new Coordinate(projection.latitude(), projection.longitude()),
                projection.category(),
                projection.telephone(),
                new PlaceThumbnail(projection.thumbnailUrl(), null, null));
        PlaceExternalSource externalSource = new PlaceExternalSource(projection.kakaoPlaceId(), projection.kakaoPlaceUrl());
        return new Place(projection.placeId(), externalSource, profile);
    }
}
