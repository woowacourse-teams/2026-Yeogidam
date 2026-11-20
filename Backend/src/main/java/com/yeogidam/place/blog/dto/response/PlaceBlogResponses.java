package com.yeogidam.place.blog.dto.response;

import com.yeogidam.place.blog.domain.BlogSearchResult;
import java.util.List;

public record PlaceBlogResponses(
        String source,
        List<PlaceBlogResponse> items
) {
    public static PlaceBlogResponses from(BlogSearchResult result) {
        List<PlaceBlogResponse> items = result.posts().stream()
                .map(PlaceBlogResponse::from)
                .toList();
        return new PlaceBlogResponses(result.source(), items);
    }
}
