package com.yeogidam.place.repository;

import java.time.Instant;

/**
 * 장소 관련 릴스용 조회 상자. shared_media_saved_places 한 행에 shared_media와 media를 붙인 모양이며 컬럼 이름을 그대로 따른다.
 * mediaId는 "릴스당 최신 공유 한 건" 규칙을 적용할 때만 쓰고 응답에는 내리지 않는다.
 */
public record SavedPlaceMediaProjection(
        Long sharedMediaId,
        Long mediaId,
        String thumbnailUrl,
        String author,
        String caption,
        String sharedUrl,
        Instant sharedAt
) {
}
