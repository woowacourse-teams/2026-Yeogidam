package com.yeogidam.media.share.dto.response;

import com.yeogidam.media.share.repository.ShareProjection;
import java.util.Collection;
import java.util.List;

public record ShareHistoryResponses(
        List<ShareHistoryResponse> sharedMedias
) {
    public ShareHistoryResponses(Collection<ShareProjection> projections) {
        this(projections.stream()
                .map(ShareHistoryResponse::new)
                .toList());
    }
}
