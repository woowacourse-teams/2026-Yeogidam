package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.ShareHistoryCursor;
import java.util.List;

public record ShareHistoryResponses(
        List<ShareHistoryResponse> sharedMedias,
        ShareHistoryCursorResponse nextCursor
) {
    public static ShareHistoryResponses from(
            List<ShareHistoryResponse> responses,
            ShareHistoryCursor nextCursor
    ) {
        return new ShareHistoryResponses(responses, ShareHistoryCursorResponse.from(nextCursor));
    }
}
