package com.yeogidam.place.dto.response;

import com.yeogidam.media.repository.MediaShareProjection;
import java.time.LocalDate;

public record PlaceMediaResponse(
        Long id,
        String title,
        String thumbnailUrl,
        String authorUsername,
        String originalUrl,
        LocalDate sharedDate
) {

    public static PlaceMediaResponse from(MediaShareProjection projection) {
        return new PlaceMediaResponse(
                projection.shareId(),
                projection.title(),
                projection.thumbnailUrl(),
                projection.authorUsername(),
                projection.sharedUrl(),
                projection.sharedAt().toLocalDate());
    }
}
