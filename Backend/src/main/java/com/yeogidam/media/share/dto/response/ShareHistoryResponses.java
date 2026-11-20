package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.SharedMediaCursor;
import java.util.List;

public record ShareHistoryResponses(
        List<ShareHistoryResponse> sharedMedias,
        SharedMediaCursorResponse nextCursor
) {
    public static ShareHistoryResponses from(
            List<ShareHistoryResponse> responses,
            SharedMediaCursor nextCursor
    ) {
        return new ShareHistoryResponses(responses, SharedMediaCursorResponse.from(nextCursor));
    }
}
