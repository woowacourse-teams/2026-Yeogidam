package com.yeogidam.media.extraction.domain;

import java.util.List;

/** Gemini가 캡션에서 찾은 장소별 지도 검색 단서. 지도에서 확인된 장소와는 구분한다. */
public record PlaceSearchHints(List<PlaceSearchHint> places) {

    public PlaceSearchHints {
        if (places == null) {
            throw new IllegalArgumentException("장소 단서 목록은 필수입니다.");
        }
        places = List.copyOf(places);
    }
}
