package com.yeogidam.media.dto.response;

import com.yeogidam.media.repository.MediaShareProjection;
import java.time.LocalDate;

public record InstagramMediaResponse(
        Long id,
        String caption,
        String thumbnailUrl,
        String author,
        String extractionStatus,
        LocalDate sharedDate
) {

    public static InstagramMediaResponse from(MediaShareProjection projection) {
        return new InstagramMediaResponse(
                projection.shareId(),
                projection.caption(),
                projection.thumbnailUrl(),
                projection.author(),
                projection.extractionStatus(),
                projection.sharedAt().toLocalDate());
    }
}
