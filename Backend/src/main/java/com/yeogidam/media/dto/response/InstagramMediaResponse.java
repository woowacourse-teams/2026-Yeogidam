package com.yeogidam.media.dto.response;

import com.yeogidam.media.repository.MediaShareProjection;
import java.time.LocalDate;

public record InstagramMediaResponse(
        Long id,
        String title,
        String thumbnailUrl,
        String authorUsername,
        String extractionStatus,
        LocalDate sharedDate
) {

    public static InstagramMediaResponse from(MediaShareProjection projection) {
        return new InstagramMediaResponse(
                projection.shareId(),
                projection.title(),
                projection.thumbnailUrl(),
                projection.authorUsername(),
                projection.extractionStatus(),
                projection.sharedAt().toLocalDate());
    }
}
