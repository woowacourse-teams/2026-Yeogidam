package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.ExtractionReport;
import com.yeogidam.media.extraction.domain.PlaceSearchHints;
import com.yeogidam.media.instagram.domain.InstagramUrl;

/** 외부 AI에서 캡션의 장소와 지도 검색 단서를 얻는 포트. */
public interface PlaceNameExtractor {

    PlaceSearchHints extract(String caption);

    PlaceSearchHints extractFile(String caption, InstagramUrl instagramUrl);

    default PlaceSearchHints extract(String caption, ExtractionReport report) {
        return extract(caption);
    }

    default PlaceSearchHints extractFile(String caption, InstagramUrl instagramUrl, ExtractionReport report) {
        return extractFile(caption, instagramUrl);
    }
}
