package com.yeogidam.media.domain;

import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;

/**
 * 사용자가 공유한 미디어 하나.
 * 소유자(OwnerId), 공유 링크(원본과 정체성), 표시용 내용, 추출 상태로 이루어진다.
 * 표시용 내용은 도메인이 들되 검증하지 않는다.
 */
public class InstagramMedia {

    private final Long id;
    private final OwnerId ownerId;
    private final SharedLink sharedLink;
    private MediaMetadata metadata;
    private Extraction extraction;

    public InstagramMedia(
            OwnerId ownerId,
            SharedLink sharedLink
    ) {
        this(null, ownerId, sharedLink, new MediaMetadata(null, null, null, null), new InProgressExtraction());
    }

    public InstagramMedia(
            Long id,
            OwnerId ownerId,
            SharedLink sharedLink,
            MediaMetadata metadata,
            Extraction extraction
    ) {
        validate(ownerId, sharedLink, extraction);
        this.id = id;
        this.ownerId = ownerId;
        this.sharedLink = sharedLink;
        this.metadata = metadata;
        this.extraction = extraction;
    }

    private void validate(OwnerId ownerId, SharedLink sharedLink, Extraction extraction) {
        if (ownerId == null) {
            throw new IllegalArgumentException("소유자가 비어 있습니다.");
        }
        if (sharedLink == null) {
            throw new IllegalArgumentException("공유 링크가 비어 있습니다.");
        }
        if (extraction == null) {
            throw new IllegalArgumentException("추출 상태가 비어 있습니다.");
        }
    }

    public void succeed(ExtractedPlaces extractedPlaces) {
        this.extraction = extraction.succeed(extractedPlaces);
    }

    public void fail(ExtractionFailureReason failureReason) {
        this.extraction = extraction.fail(failureReason);
    }

    public void retry() {
        this.extraction = extraction.retry();
    }

    public void fillMetadata(MediaMetadata metadata) {
        this.metadata = metadata;
    }

    public void decidePlaces(
            List<Long> placeIds,
            PlaceDecisionStatus target
    ) {
        extraction.extractedPlaces().decide(placeIds, target);
    }

    public Long id() {
        return id;
    }

    public OwnerId ownerId() {
        return ownerId;
    }

    public SharedLink sharedLink() {
        return sharedLink;
    }

    public MediaMetadata metadata() {
        return metadata;
    }

    public Extraction extraction() {
        return extraction;
    }
}
