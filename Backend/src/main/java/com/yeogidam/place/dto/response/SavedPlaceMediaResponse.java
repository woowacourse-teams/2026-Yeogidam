package com.yeogidam.place.dto.response;

import com.yeogidam.place.repository.SavedPlaceMediaProjection;
import java.time.Instant;

/**
 * 장소를 저장하게 만든 릴스 한 건. 필드 이름은 히스토리 목록의 "공유 한 건"과 같다.
 */
public record SavedPlaceMediaResponse(
        Long sharedMediaId,
        String thumbnailUrl,
        String author,
        String caption,
        String sharedUrl,
        Instant sharedAt
) {
    public static SavedPlaceMediaResponse from(SavedPlaceMediaProjection projection) {
        return new SavedPlaceMediaResponse(
                projection.sharedMediaId(),
                projection.thumbnailUrl(),
                projection.author(),
                projection.caption(),
                projection.sharedUrl(),
                projection.sharedAt()
        );
    }
}
