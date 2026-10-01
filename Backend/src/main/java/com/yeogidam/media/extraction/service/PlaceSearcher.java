package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.place.domain.Place;
import java.util.List;

/** 지도 제공자의 결과에서 캡션에 언급된 장소 하나 또는 애매한 후보 목록을 찾는다. */
public interface PlaceSearcher {

    List<Place> search(PlaceSearchHint hint);
}
