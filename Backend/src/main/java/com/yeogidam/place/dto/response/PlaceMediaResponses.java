package com.yeogidam.place.dto.response;

import com.yeogidam.media.repository.MediaShareProjection;
import java.util.List;

public record PlaceMediaResponses(
        List<PlaceMediaResponse> media
) {

    public static PlaceMediaResponses from(List<MediaShareProjection> projections) {
        List<PlaceMediaResponse> media = projections.stream()
                .map(PlaceMediaResponse::from)
                .toList();
        return new PlaceMediaResponses(media);
    }
}
