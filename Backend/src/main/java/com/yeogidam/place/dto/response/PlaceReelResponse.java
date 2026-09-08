package com.yeogidam.place.dto.response;

import java.time.LocalDate;

public record PlaceReelResponse(
        Long id,
        String title,
        String thumbnailUrl,
        String authorUsername,
        String originalUrl,
        LocalDate sharedDate
) {
}
