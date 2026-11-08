package com.yeogidam.place.dto.response;

import com.yeogidam.place.repository.PlaceMediaProjection;
import java.util.List;
import java.util.function.UnaryOperator;

public record PlaceMediaResponses(
        List<PlaceMediaResponse> media
) {
    public static PlaceMediaResponses from(
            List<PlaceMediaProjection> shares,
            UnaryOperator<String> thumbnailUrlResolver
    ) {
        List<PlaceMediaResponse> responses = shares.stream()
                .map(share -> PlaceMediaResponse.from(share, thumbnailUrlResolver))
                .toList();
        return new PlaceMediaResponses(responses);
    }
}
