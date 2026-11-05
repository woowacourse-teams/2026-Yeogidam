package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.extraction.repository.SavedMediaPlaceProjection;
import com.yeogidam.media.share.repository.SavedMediaProjection;
import java.time.Instant;
import java.util.List;
import java.util.function.UnaryOperator;

/**
 * 보관함 게시물 한 건으로, 게시물 필드 이름은 히스토리 목록의 "공유 한 건"과 같고 게시물에서 추출된 장소를 추출 순서로 담는다.
 */
public record SavedMediaResponse(
        Long sharedMediaId,
        Instant createdAt,
        String thumbnailUrl,
        String caption,
        String author,
        String sharedUrl,
        List<SavedMediaPlaceResponse> places
) {
    public static SavedMediaResponse from(
            SavedMediaProjection projection,
            List<SavedMediaPlaceProjection> places,
            UnaryOperator<String> thumbnailUrlResolver
    ) {
        List<SavedMediaPlaceResponse> placeResponses = places.stream()
                .map(place -> SavedMediaPlaceResponse.from(place, thumbnailUrlResolver))
                .toList();
        return new SavedMediaResponse(
                projection.sharedMediaId(),
                projection.createdAt(),
                thumbnailUrlResolver.apply(projection.thumbnailKey()),
                projection.caption(),
                projection.author(),
                projection.sharedUrl(),
                placeResponses
        );
    }
}
