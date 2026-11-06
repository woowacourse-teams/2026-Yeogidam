package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.extraction.repository.SavedMediaPlaceProjections;
import com.yeogidam.media.share.repository.SavedMediaProjections;
import java.util.List;
import java.util.function.UnaryOperator;

/**
 * 보관함 게시물 탭의 한 페이지를 장소 상세 릴스와 같은 media 키와 다음 커서(nextCursor)로 내린다.
 */
public record SavedMediaResponses(
        List<SavedMediaResponse> media,
        SharedMediaCursorResponse nextCursor
) {
    public static SavedMediaResponses from(
            SavedMediaProjections shares,
            SavedMediaPlaceProjections places,
            UnaryOperator<String> thumbnailUrlResolver
    ) {
        List<SavedMediaResponse> responses = shares.page()
                .stream()
                .map(share -> SavedMediaResponse.from(share, places.placesOf(share.mediaId()), thumbnailUrlResolver))
                .toList();
        return new SavedMediaResponses(responses, SharedMediaCursorResponse.from(shares.nextCursor()));
    }
}
