package com.yeogidam.media.share.dto.response;

public record ExtractionRetryResponse(
        Long sharedMediaId,
        String extractionStatus
) {
}
