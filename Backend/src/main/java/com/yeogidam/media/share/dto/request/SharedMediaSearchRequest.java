package com.yeogidam.media.share.dto.request;

import com.yeogidam.media.share.repository.SharedMediaCursor;
import com.yeogidam.media.share.domain.CaptionSearchQuery;
import jakarta.validation.constraints.NotBlank;
import java.time.Instant;
import java.util.Optional;

public record SharedMediaSearchRequest(
        @NotBlank String query,
        Instant cursorCreatedAt,
        Long cursorId
) {
    public CaptionSearchQuery toQuery() {
        return new CaptionSearchQuery(query);
    }

    public Optional<SharedMediaCursor> toCursor() {
        return SharedMediaCursor.fromParameters(cursorCreatedAt, cursorId);
    }
}
