package com.yeogidam.media.dto.response;

import java.time.LocalDate;

public record InstagramMediaResponse(
        Long id,
        String title,
        String thumbnailUrl,
        String authorUsername,
        String extractionStatus,
        LocalDate sharedDate
) {
}
