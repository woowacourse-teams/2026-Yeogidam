package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.SharedMediaCursor;
import java.time.Instant;

public record SharedMediaCursorResponse(
        Instant createdAt,
        Long id
) {

    public static SharedMediaCursorResponse from(SharedMediaCursor cursor) {
        if (cursor == null) {
            return null;
        }
        return new SharedMediaCursorResponse(cursor.createdAt(), cursor.sharedMediaId());
    }
}
