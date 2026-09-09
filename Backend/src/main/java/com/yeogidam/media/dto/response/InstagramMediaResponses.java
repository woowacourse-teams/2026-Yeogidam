package com.yeogidam.media.dto.response;

import com.yeogidam.media.repository.MediaShareProjection;
import java.util.List;

public record InstagramMediaResponses(
        List<InstagramMediaResponse> media
) {

    public static InstagramMediaResponses from(List<MediaShareProjection> projections) {
        List<InstagramMediaResponse> media = projections.stream()
                .map(InstagramMediaResponse::from)
                .toList();
        return new InstagramMediaResponses(media);
    }
}
