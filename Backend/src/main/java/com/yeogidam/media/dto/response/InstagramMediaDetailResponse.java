package com.yeogidam.media.dto.response;

import com.yeogidam.media.domain.ExtractionFailureReason;
import com.yeogidam.media.repository.MediaShareView;
import com.yeogidam.place.dto.response.PlaceResponse;
import com.yeogidam.place.repository.PlaceDecisionView;
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

    public static InstagramMediaDetailResponse from(
            MediaShareView view,
            List<PlaceDecisionView> placeViews
    ) {
        List<PlaceResponse> places = placeViews.stream()
                .map(PlaceResponse::from)
                .toList();
        return new InstagramMediaDetailResponse(
                view.shareId(),
                view.title(),
                view.thumbnailUrl(),
                view.authorUsername(),
                view.extractionStatus(),
                toFailureDescription(view.failureReason()),
                view.sharedUrl(),
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
