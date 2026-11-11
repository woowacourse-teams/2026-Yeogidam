package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.place.domain.Place;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 장소 단서의 나라를 보고 국내 장소는 카카오 검색으로, 한국 밖 장소는 해외 검색으로 보낸다.
 * 국내 단서는 카카오가 0건이면 보조 검색으로 한 번 더 찾는다. 카카오가 다른 가게를 붙인 경우는 0건이 아니라서 보조 검색을 부르지 않는다.
 */
@Service
@RequiredArgsConstructor
public class PlaceSearchRouter {

    private final DomesticPlaceSearcher domesticPlaceSearcher;
    private final OverseasPlaceSearcher overseasPlaceSearcher;
    private final DomesticFallbackPlaceSearcher domesticFallbackPlaceSearcher;

    public List<Place> search(PlaceSearchHint hint) {
        if (!hint.isDomestic()) {
            // 해외에서 못 찾았다고 카카오로 다시 보내면 이름만 검색에서 국내의 같은 이름 가게가 붙어서, 카카오로 되돌리지 않는다.
            return overseasPlaceSearcher.search(hint);
        }
        List<Place> places = domesticPlaceSearcher.search(hint);
        if (!places.isEmpty()) {
            return places;
        }
        return domesticFallbackPlaceSearcher.search(hint);
    }
}
