package com.yeogidam.media.share.repository;

import java.time.Instant;

/**
 * 보관함 게시물 탭용 조회 상자. 분석에 성공한 내 공유 한 건에 게시물 정보를 붙인 모양이며 컬럼 이름을 그대로 따른다.
 * mediaId는 게시물마다 최신 공유 한 건만 남기고 장소를 붙일 때만 쓰고 응답에는 내리지 않는다.
 */
public record SavedMediaProjection(
        Long sharedMediaId,
        Long mediaId,
        Instant createdAt,
        String thumbnailKey,
        String caption,
        String author,
        String sharedUrl
) {
}
