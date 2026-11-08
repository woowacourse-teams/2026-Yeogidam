package com.yeogidam.place.dto.response;

import com.yeogidam.place.repository.PlaceMediaProjection;
import java.time.Instant;
import java.util.function.UnaryOperator;

/**
 * 장소가 추출된 내 게시글 한 건으로, 필드 이름은 장소 관련 릴스 응답(SavedPlaceMediaResponse)과 같다.
 */
public record PlaceMediaResponse(
        Long sharedMediaId,
        String thumbnailUrl,
        String author,
        String caption,
        String sharedUrl,
        Instant createdAt
) {
    public static PlaceMediaResponse from(
            PlaceMediaProjection projection,
            UnaryOperator<String> thumbnailUrlResolver
    ) {
        return new PlaceMediaResponse(
                projection.sharedMediaId(),
                thumbnailUrlResolver.apply(projection.thumbnailKey()),
                projection.author(),
                projection.caption(),
                projection.sharedUrl(),
                projection.createdAt()
        );
    }
}
