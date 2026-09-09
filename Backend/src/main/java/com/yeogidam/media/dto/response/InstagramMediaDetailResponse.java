package com.yeogidam.media.dto.response;

import com.yeogidam.media.domain.ExtractionFailureReason;
import com.yeogidam.media.repository.MediaShareProjection;
import com.yeogidam.place.dto.response.PlaceResponse;
import com.yeogidam.place.repository.PlaceDecisionProjection;
import java.util.List;

public record InstagramMediaDetailResponse(
        Long id,
        String caption,
        String thumbnailUrl,
        String author,
        String extractionStatus,
        String failureReason,
        String originalUrl,
        int placeCount,
        List<PlaceResponse> places
) {

    public static InstagramMediaDetailResponse from(
            MediaShareProjection projection,
            List<PlaceDecisionProjection> placeViews
    ) {
        List<PlaceResponse> places = placeViews.stream()
                .map(PlaceResponse::from)
                .toList();
        return new InstagramMediaDetailResponse(
                projection.shareId(),
                projection.caption(),
                projection.thumbnailUrl(),
                projection.author(),
                projection.extractionStatus(),
                toFailureDescription(projection.failureReason()),
                projection.sharedUrl(),
                places.size(),
                places);
    }

    private static String toFailureDescription(String failureReason) {
        if (failureReason == null) {
            return null;
        }
        return ExtractionFailureReason.valueOf(failureReason).description();
    }
}
