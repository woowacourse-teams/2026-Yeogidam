package com.yeogidam.support.fake;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.service.PlaceSearcher;
import com.yeogidam.place.domain.Place;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class FakePlaceSearcher implements PlaceSearcher {

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
