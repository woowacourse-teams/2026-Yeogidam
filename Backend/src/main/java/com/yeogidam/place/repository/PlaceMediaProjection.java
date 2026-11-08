package com.yeogidam.place.repository;

import java.time.Instant;

/**
 * 장소 상세 목록용 조회 상자로, 공유 한 건에 게시물 정보를 붙인 모양이며 컬럼 이름을 그대로 따른다.
 */
public record PlaceMediaProjection(
        Long sharedMediaId,
        String thumbnailKey,
        String author,
        String caption,
        String sharedUrl,
        Instant createdAt
) {
}
