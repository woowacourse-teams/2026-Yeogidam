package com.yeogidam.media.extraction.service;

import com.yeogidam.place.service.SearchedPlace;
import java.util.List;

public record ExtractionOutcome(
        InstagramContent content,
        List<SearchedPlace> places
) {
}
