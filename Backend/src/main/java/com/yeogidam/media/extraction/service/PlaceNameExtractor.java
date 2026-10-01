package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.PlaceSearchHints;

/** 외부 AI에서 캡션의 장소와 지도 검색 단서를 얻는 포트. */
public interface PlaceNameExtractor {

    PlaceSearchHints extract(String caption);
}
