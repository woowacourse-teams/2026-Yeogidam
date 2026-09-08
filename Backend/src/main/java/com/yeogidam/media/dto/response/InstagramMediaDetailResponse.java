package com.yeogidam.media.dto.response;

import com.yeogidam.place.dto.response.PlaceResponse;
import java.util.List;

public record InstagramMediaDetailResponse(
        Long id,
        String title,
        String thumbnailUrl,
        String authorUsername,
        String extractionStatus,
        String failureReason,
        String originalUrl,
        int placeCount,
        List<PlaceResponse> places
) {
}
