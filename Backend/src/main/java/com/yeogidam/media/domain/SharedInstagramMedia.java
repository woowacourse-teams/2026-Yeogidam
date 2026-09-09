package com.yeogidam.media.domain;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;

/**
 * 특정 사용자가 게시물을 공유한 사건.
 * 같은 게시물을 다시 공유해도 새 사건으로 쌓여 이력이 남는다.
 * 소유자(memberId)와 게시물(mediaId)은 집합체 간 id 참조이고, 받은 원본은 InstagramUrl이 사실로 보관한다.
 * 후보(PlaceCandidates)는 이 공유 건에 발급된 것이라 결정(decidePlaces)도 공유의 행위다.
 */
public class SharedInstagramMedia {

    private final Long id;
    private final Long memberId;
    private final Long mediaId;
    private final InstagramUrl instagramUrl;
    private final PlaceCandidates candidates;

    public SharedInstagramMedia(
            Long memberId,
            InstagramUrl instagramUrl
    ) {
        this(null, memberId, null, instagramUrl, null);
    }

    public SharedInstagramMedia(
            Long id,
            Long memberId,
            Long mediaId,
            InstagramUrl instagramUrl,
            PlaceCandidates candidates
    ) {
        validate(memberId, instagramUrl);
        this.id = id;
        this.memberId = memberId;
        this.mediaId = mediaId;
        this.instagramUrl = instagramUrl;
        this.candidates = candidates;
    }

    private void validate(Long memberId, InstagramUrl instagramUrl) {
        if (memberId == null) {
            throw new IllegalArgumentException("소유자가 비어 있습니다.");
        }
        if (instagramUrl == null) {
            throw new IllegalArgumentException("인스타그램 URL이 비어 있습니다.");
        }
    }

    public List<Long> decidePlaces(
            List<Long> placeIds,
            PlaceDecisionStatus target
    ) {
        validateCandidatesIssued();
        return candidates.decide(placeIds, target);
    }

    private void validateCandidatesIssued() {
        if (candidates == null) {
            throw new MediaException(MediaErrorCode.EXTRACTION_NOT_FINISHED);
        }
    }

    public Long id() {
        return id;
    }

    public Long memberId() {
        return memberId;
    }

    public Long mediaId() {
        return mediaId;
    }

    public InstagramUrl instagramUrl() {
        return instagramUrl;
    }

    public PlaceCandidates candidates() {
        return candidates;
    }
}
