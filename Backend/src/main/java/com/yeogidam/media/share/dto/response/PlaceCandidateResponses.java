package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.SharedMediaProjection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public record PlaceCandidateResponses(
        List<PlaceCandidateSharedMediaResponse> sharedMedias
) {
    public PlaceCandidateResponses(
            List<SharedMediaProjection> sharedMediaProjections,
            List<PlaceCandidateProjection> placeProjections
    ) {
        this(createSharedMediaResponses(sharedMediaProjections, placeProjections));
    }

    private static List<PlaceCandidateSharedMediaResponse> createSharedMediaResponses(
            List<SharedMediaProjection> sharedMediaProjections,
            List<PlaceCandidateProjection> placeProjections
    ) {
        Map<Long, List<PlaceCandidateProjection>> placesBySharedMediaId = groupPlacesBySharedMediaId(placeProjections);

        return sharedMediaProjections.stream()
                .map(projection -> createSharedMediaResponse(projection, placesBySharedMediaId))
                .toList();
    }

    private static Map<Long, List<PlaceCandidateProjection>> groupPlacesBySharedMediaId(List<PlaceCandidateProjection> projections) {
        return projections.stream()
                .collect(Collectors.groupingBy(
                        PlaceCandidateProjection::sharedMediaId,
                        LinkedHashMap::new,
                        Collectors.toList()
                ));
    }

    private static PlaceCandidateSharedMediaResponse createSharedMediaResponse(
            SharedMediaProjection projection,
            Map<Long, List<PlaceCandidateProjection>> placesBySharedMediaId
    ) {
        List<PlaceCandidateResponse> places = placesBySharedMediaId
                .getOrDefault(projection.sharedMediaId(), List.of())
                .stream()
                .map(PlaceCandidateResponse::new)
                .toList();
        return new PlaceCandidateSharedMediaResponse(projection, places);
    }
}
