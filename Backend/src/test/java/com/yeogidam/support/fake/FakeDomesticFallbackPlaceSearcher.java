package com.yeogidam.support.fake;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.service.DomesticFallbackPlaceSearcher;
import com.yeogidam.place.domain.Place;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Google Places를 부르지 않고, 카카오가 찾지 못한 캡션 장소명마다 미리 넣어 둔 국내 장소를 돌려준다.
 */
public final class FakeDomesticFallbackPlaceSearcher implements DomesticFallbackPlaceSearcher {

    private final Map<String, Place> places = new ConcurrentHashMap<>();

    @Override
    public List<Place> search(PlaceSearchHint hint) {
        Place place = places.get(hint.nameInCaption());
        if (place == null) {
            return List.of();
        }
        return List.of(place);
    }

    public void add(String name, Place place) {
        places.put(name, place);
    }

    public void reset() {
        places.clear();
    }
}
