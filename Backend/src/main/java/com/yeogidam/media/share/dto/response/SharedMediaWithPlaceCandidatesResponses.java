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
            List<PlaceCandidateProjection> placeProjections,
            Map<Long, String> instagramThumbnailUrls,
            Map<Long, String> placeThumbnailUrls
    ) {
        return new SharedMediaWithPlaceCandidatesResponses(
                createSharedMediaResponses(sharedMediaSummaryProjections, placeProjections,
                        instagramThumbnailUrls, placeThumbnailUrls)
        );
    }

    private static List<SharedMediaWithPlaceCandidatesResponse> createSharedMediaResponses(
            List<SharedMediaSummaryProjection> sharedMediaSummaryProjections,
            List<PlaceCandidateProjection> placeProjections,
            Map<Long, String> instagramThumbnailUrls,
            Map<Long, String> placeThumbnailUrls
    ) {
        Map<Long, List<PlaceCandidateProjection>> placesBySharedMediaId = groupPlacesBySharedMediaId(placeProjections);

        return sharedMediaSummaryProjections.stream()
                .map(projection -> createSharedMediaResponse(
                        projection, placesBySharedMediaId, instagramThumbnailUrls, placeThumbnailUrls))
                .toList();
    }

    private static Map<Long, List<PlaceCandidateProjection>> groupPlacesBySharedMediaId(
            List<PlaceCandidateProjection> projections
    ) {
        return projections.stream()
                .collect(Collectors.groupingBy(
                        PlaceCandidateProjection::sharedMediaId,
                        LinkedHashMap::new,
                        Collectors.toList()
                ));
    }

    private static SharedMediaWithPlaceCandidatesResponse createSharedMediaResponse(
            SharedMediaSummaryProjection projection,
            Map<Long, List<PlaceCandidateProjection>> placesBySharedMediaId,
            Map<Long, String> instagramThumbnailUrls,
            Map<Long, String> placeThumbnailUrls
    ) {
        List<PlaceCandidateResponse> places = placesBySharedMediaId
                .getOrDefault(projection.sharedMediaId(), List.of())
                .stream()
                .map(place -> PlaceCandidateResponse.from(place, placeThumbnailUrls.get(place.placeId())))
                .toList();
        return SharedMediaWithPlaceCandidatesResponse.from(
                projection,
                instagramThumbnailUrls.get(projection.sharedMediaId()),
                places);
    }
}
