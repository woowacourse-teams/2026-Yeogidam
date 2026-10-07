package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.extraction.repository.MediaPlaceProjection;
import java.util.List;
import java.util.Map;

public record ShareHistoryPlaceResponses(List<ShareHistoryPlaceResponse> places) {
    public static ShareHistoryPlaceResponses from(
            List<MediaPlaceProjection> projections,
            Map<Long, String> thumbnailUrls
    ) {
        return new ShareHistoryPlaceResponses(projections.stream()
                .map(projection -> ShareHistoryPlaceResponse.from(
                        projection,
                        thumbnailUrls.get(projection.placeId())))
                .toList());
    }
}
