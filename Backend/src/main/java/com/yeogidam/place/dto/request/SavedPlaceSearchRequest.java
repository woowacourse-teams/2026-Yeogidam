package com.yeogidam.place.dto.request;

import com.yeogidam.search.domain.SearchQuery;
import jakarta.validation.constraints.NotBlank;

public record SavedPlaceSearchRequest(
        @NotBlank
        String query
) {
    public SearchQuery toQuery() {
        return new SearchQuery(query);
    }
}
