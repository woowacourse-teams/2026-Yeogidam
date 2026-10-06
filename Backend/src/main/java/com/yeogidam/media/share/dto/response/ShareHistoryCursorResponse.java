package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.ShareHistoryCursor;
import java.time.Instant;

public record ShareHistoryCursorResponse(
        Instant createdAt,
        Long id
) {

    public static ShareHistoryCursorResponse from(ShareHistoryCursor cursor) {
        if (cursor == null) {
            return null;
        }
        return new ShareHistoryCursorResponse(cursor.createdAt(), cursor.sharedMediaId());
    }
}
