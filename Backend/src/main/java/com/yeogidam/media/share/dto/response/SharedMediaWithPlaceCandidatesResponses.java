package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.SharedMediaSummaryProjection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public record SharedMediaWithPlaceCandidatesResponses(
        List<SharedMediaWithPlaceCandidatesResponse> sharedMedias
) {
    public static SharedMediaWithPlaceCandidatesResponses from(
            List<SharedMediaSummaryProjection> sharedMediaSummaryProjections,
            List<PlaceCandidateProjection> placeProjections
    ) {
        return new SharedMediaWithPlaceCandidatesResponses(
                createSharedMediaResponses(sharedMediaSummaryProjections, placeProjections)
        );
    }

    private static List<SharedMediaWithPlaceCandidatesResponse> createSharedMediaResponses(
            List<SharedMediaSummaryProjection> sharedMediaSummaryProjections,
            List<PlaceCandidateProjection> placeProjections
    ) {
        Map<Long, List<PlaceCandidateProjection>> placesBySharedMediaId = groupPlacesBySharedMediaId(placeProjections);

        return sharedMediaSummaryProjections.stream()
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

    private static SharedMediaWithPlaceCandidatesResponse createSharedMediaResponse(
            SharedMediaSummaryProjection projection,
            Map<Long, List<PlaceCandidateProjection>> placesBySharedMediaId
    ) {
        List<PlaceCandidateResponse> places = placesBySharedMediaId
                .getOrDefault(projection.sharedMediaId(), List.of())
                .stream()
                .map(PlaceCandidateResponse::from)
                .toList();
        return SharedMediaWithPlaceCandidatesResponse.from(projection, places);
    }
}
