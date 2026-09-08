package com.yeogidam.media.domain;

import com.yeogidam.media.exception.UnselectablePlaceException;
import com.yeogidam.place.domain.PlaceDecisionStatus;
import java.util.List;

/**
 * 특정 사용자가 게시물을 공유한 사건.
 * 같은 게시물을 다시 공유해도 새 사건으로 쌓여 이력이 남는다.
 * 게시물은 집합체 간 id 참조(mediaId)로 들고, 받은 원본은 InstagramUrl이 사실로 보관한다.
 * 후보(PlaceCandidates)는 이 공유 건에 발급된 것이라 결정(decidePlaces)도 공유의 행위다.
 */
public class MediaShare {

    private final Long id;
    private final OwnerId ownerId;
    private final Long mediaId;
    private final InstagramUrl instagramUrl;
    private final PlaceCandidates candidates;

    public MediaShare(
            OwnerId ownerId,
            InstagramUrl instagramUrl
    ) {
        this(null, ownerId, null, instagramUrl, null);
    }

    public MediaShare(
            Long id,
            OwnerId ownerId,
            Long mediaId,
            InstagramUrl instagramUrl,
            PlaceCandidates candidates
    ) {
        validate(ownerId, instagramUrl);
        this.id = id;
        this.ownerId = ownerId;
        this.mediaId = mediaId;
        this.instagramUrl = instagramUrl;
        this.candidates = candidates;
    }

    private void validate(OwnerId ownerId, InstagramUrl instagramUrl) {
        if (ownerId == null) {
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
            throw new UnselectablePlaceException("추출이 끝나지 않은 공유에는 선택할 장소가 없습니다.");
        }
    }

    public Long id() {
        return id;
    }

    public OwnerId ownerId() {
        return ownerId;
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
