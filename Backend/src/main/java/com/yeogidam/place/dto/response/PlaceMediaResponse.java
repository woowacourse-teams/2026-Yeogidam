package com.yeogidam.place.dto.response;

import com.yeogidam.media.repository.MediaShareProjection;
import java.time.LocalDate;

public record PlaceMediaResponse(
        Long id,
        String caption,
        String thumbnailUrl,
        String author,
        String originalUrl,
        LocalDate sharedDate
) {

    public static PlaceMediaResponse from(MediaShareProjection projection) {
        return new PlaceMediaResponse(
                projection.shareId(),
                projection.caption(),
                projection.thumbnailUrl(),
                projection.author(),
                projection.sharedUrl(),
                projection.sharedAt().toLocalDate());
    }
}
