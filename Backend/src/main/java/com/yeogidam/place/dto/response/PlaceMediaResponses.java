package com.yeogidam.place.dto.response;

import com.yeogidam.media.repository.MediaShareView;
import java.util.List;

public record PlaceMediaResponses(
        List<PlaceMediaResponse> media
) {

    public static PlaceMediaResponses from(List<MediaShareView> views) {
        List<PlaceMediaResponse> media = views.stream()
                .map(PlaceMediaResponse::from)
                .toList();
        return new PlaceMediaResponses(media);
    }
}
