package com.yeogidam.place.dto.request;

import com.yeogidam.place.domain.SearchQuery;

public record SavedPlaceSearchRequest(String query) {

    public SearchQuery toQuery() {
        return new SearchQuery(query);
    }
}
