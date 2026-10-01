package com.yeogidam.media.share.dto.response;

import java.util.List;

public record ShareHistoryResponses(
        List<ShareHistoryResponse> sharedMedias
) {
    public static ShareHistoryResponses from(List<ShareHistoryResponse> responses) {
        return new ShareHistoryResponses(responses);
    }
}
