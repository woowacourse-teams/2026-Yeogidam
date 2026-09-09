package com.yeogidam.media.dto.response;

import com.yeogidam.media.extraction.domain.ExtractionStatus;

public record InstagramMediaReceiptResponse(
        Long id,
        String extractionStatus
) {

    public static InstagramMediaReceiptResponse from(
            Long shareId,
            ExtractionStatus extractionStatus
    ) {
        return new InstagramMediaReceiptResponse(shareId, extractionStatus.name());
    }
}
