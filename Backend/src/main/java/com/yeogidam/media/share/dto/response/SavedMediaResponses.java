package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.extraction.repository.SavedMediaPlaceProjections;
import com.yeogidam.media.share.repository.SavedMediaProjections;
import java.util.List;
import java.util.function.UnaryOperator;

/**
 * 보관함 게시물 탭의 한 페이지를 히스토리 목록과 같은 sharedMedias, nextCursor 모양으로 내린다.
 */
public record SavedMediaResponses(
        List<SavedMediaResponse> sharedMedias,
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
