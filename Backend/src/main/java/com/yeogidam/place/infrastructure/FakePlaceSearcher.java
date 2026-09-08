package com.yeogidam.place.infrastructure;

import com.yeogidam.place.service.CandidatePlaceName;
import com.yeogidam.place.service.PlaceSearcher;
import com.yeogidam.place.service.SearchedPlace;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * TODO 카카오 로컬 API(keyword.json) 구현으로 교체한다.
 * 수파베이스 파이프라인의 카카오 매칭 단계에 해당한다.
 */
@Component
public class FakePlaceSearcher implements PlaceSearcher {

    private static final Map<String, SearchedPlace> KNOWN_PLACES = Map.of(
            "카페 온월", new SearchedPlace(
                    "카페 온월",
                    "음식점 > 카페",
                    "서울 성동구 성수동2가 289-10",
                    "서울 성동구 성수이로 88 2층",
                    new BigDecimal("37.5443"),
                    new BigDecimal("127.0557"),
                    "26338954",
                    "http://place.map.kakao.com/26338954",
                    "02-1234-5678",
                    "https://picsum.photos/seed/onwol/200"),
            "성수동 갈비집", new SearchedPlace(
                    "성수동 갈비집",
                    "음식점 > 한식",
                    "서울 성동구 성수동1가 13-1",
                    "서울 성동구 왕십리로 115",
                    new BigDecimal("37.5466"),
                    new BigDecimal("127.0431"),
                    "18577297",
                    "http://place.map.kakao.com/18577297",
                    "02-2345-6789",
                    "https://picsum.photos/seed/galbi/200")
    );

    @Override
    public Optional<SearchedPlace> search(CandidatePlaceName candidatePlaceName) {
        return Optional.ofNullable(KNOWN_PLACES.get(candidatePlaceName.value()));
    }
}
