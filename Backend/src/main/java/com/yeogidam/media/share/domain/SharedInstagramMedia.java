package com.yeogidam.media.share.domain;

import com.yeogidam.media.instagram.domain.InstagramUrl;
import lombok.Getter;

/**
 * 특정 사용자가 게시물을 공유한 사건. 같은 게시물을 다시 공유해도 새 이력으로 남는다.
 */
@Getter
public class SharedInstagramMedia {

    private final Long memberId;
    private final Long mediaId;
    private final InstagramUrl instagramUrl;

    public SharedInstagramMedia(Long memberId, Long mediaId, InstagramUrl instagramUrl) {
        validate(memberId, mediaId, instagramUrl);
        this.memberId = memberId;
        this.mediaId = mediaId;
        this.instagramUrl = instagramUrl;
    }

    private void validate(Long memberId, Long mediaId, InstagramUrl instagramUrl) {
        if (memberId == null) {
            throw new IllegalArgumentException("소유자가 비어 있습니다.");
        }
        if (mediaId == null) {
            throw new IllegalArgumentException("게시물이 비어 있습니다.");
        }
        if (instagramUrl == null) {
            throw new IllegalArgumentException("인스타그램 URL이 비어 있습니다.");
        }
    }
}
