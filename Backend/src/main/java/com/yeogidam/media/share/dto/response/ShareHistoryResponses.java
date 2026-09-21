package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.ShareProjection;
import java.util.List;

public record ShareHistoryResponses(
        List<ShareHistoryResponse> sharedMedias
) {
    public static ShareHistoryResponses from(List<ShareProjection> projections) {
        return new ShareHistoryResponses(projections.stream()
                .map(ShareHistoryResponse::from)
                .toList());
    }
}
