package com.yeogidam.place.dto.response;

import com.yeogidam.media.repository.MediaShareView;
import java.time.LocalDate;

public record PlaceMediaResponse(
        Long id,
        String title,
        String thumbnailUrl,
        String authorUsername,
        String originalUrl,
        LocalDate sharedDate
) {

    public static PlaceMediaResponse from(MediaShareView view) {
        return new PlaceMediaResponse(
                view.shareId(),
                view.title(),
                view.thumbnailUrl(),
                view.authorUsername(),
                view.sharedUrl(),
                view.sharedAt().toLocalDate());
    }
}
