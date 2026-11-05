package com.yeogidam.media.extraction.repository;

/**
 * 보관함 게시물 탭에서 게시물 하나에 붙는 장소 한 곳으로, 게시물에서 추출된 장소에 회원의 보관함 항목 ID를 붙인다.
 * 회원이 보관함에 두지 않은 장소면 savedPlaceId를 null로 둔다.
 */
public record SavedMediaPlaceProjection(
        Long mediaId,
        Long placeId,
        Long savedPlaceId,
        String thumbnailKey,
        String name,
        String category,
        String landLotAddress,
        String roadAddress
) {
}
