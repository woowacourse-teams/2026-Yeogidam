package com.yeogidam.media.dto.response;

import com.yeogidam.media.repository.MediaShareView;
import java.time.LocalDate;

public record InstagramMediaResponse(
        Long id,
        String title,
        String thumbnailUrl,
        String authorUsername,
        String extractionStatus,
        LocalDate sharedDate
) {

    public static InstagramMediaResponse from(MediaShareView view) {
        return new InstagramMediaResponse(
                view.shareId(),
                view.title(),
                view.thumbnailUrl(),
                view.authorUsername(),
                view.extractionStatus(),
                view.sharedAt().toLocalDate());
    }
}
