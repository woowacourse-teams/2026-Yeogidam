package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.place.domain.Place;
import java.util.List;

/** 카카오가 찾지 못한 국내 장소 단서를 다른 지도 제공자에서 한 번 더 찾는다. 찾지 못하면 빈 목록이다. */
public interface DomesticFallbackPlaceSearcher {

    List<Place> search(PlaceSearchHint hint);
}
