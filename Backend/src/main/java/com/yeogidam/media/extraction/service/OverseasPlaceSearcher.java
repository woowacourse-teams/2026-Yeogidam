package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.place.domain.Place;
import java.util.List;

/** 한국 밖 장소 단서로 해외 지도 제공자에서 장소 하나를 찾는다. 찾지 못하면 빈 목록이다. */
public interface OverseasPlaceSearcher {

    List<Place> search(PlaceSearchHint hint);
}
