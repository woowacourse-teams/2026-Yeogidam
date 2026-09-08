package com.yeogidam.media.domain;

import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;

/**
 * 사용자가 공유한 미디어 하나.
 * 소유자(OwnerId), 인스타그램 URL(원본과 정체성), 표시용 내용, 추출 상태로 이루어진다.
 * 표시용 내용은 도메인이 들되 검증하지 않는다.
 */
public class InstagramMedia {

    private final Long id;
    private final OwnerId ownerId;
    private final InstagramUrl instagramUrl;
    private MediaMetadata metadata;
    private Extraction extraction;

    public InstagramMedia(
            OwnerId ownerId,
            InstagramUrl instagramUrl
    ) {
        this(null, ownerId, instagramUrl, new MediaMetadata(null, null, null, null), new InProgressExtraction());
    }

    public InstagramMedia(
            Long id,
            OwnerId ownerId,
            InstagramUrl instagramUrl,
            MediaMetadata metadata,
            Extraction extraction
    ) {
        validate(ownerId, instagramUrl, extraction);
        this.id = id;
        this.ownerId = ownerId;
        this.instagramUrl = instagramUrl;
        this.metadata = metadata;
        this.extraction = extraction;
    }

    private void validate(OwnerId ownerId, InstagramUrl instagramUrl, Extraction extraction) {
        if (ownerId == null) {
            throw new IllegalArgumentException("소유자가 비어 있습니다.");
        }
        if (instagramUrl == null) {
            throw new IllegalArgumentException("인스타그램 URL이 비어 있습니다.");
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

    public InstagramUrl instagramUrl() {
        return instagramUrl;
    }

    public MediaMetadata metadata() {
        return metadata;
    }

    public Extraction extraction() {
        return extraction;
    }
}
