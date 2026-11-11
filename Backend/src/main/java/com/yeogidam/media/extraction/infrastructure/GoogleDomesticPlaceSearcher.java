package com.yeogidam.media.extraction.infrastructure;

import static com.yeogidam.media.extraction.infrastructure.GooglePlaceCandidateFinder.normalize;

import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.service.DomesticFallbackPlaceSearcher;
import com.yeogidam.place.domain.CountryCode;
import com.yeogidam.place.domain.Place;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 카카오가 찾지 못한 국내 장소 단서를 Google Places에서 한국(KR) 안으로 한 번 더 찾는다.
 * 카카오 로컬 API는 카카오맵 웹에 있는 가게도 검색에서 돌려주지 않을 때가 있어서, 이런 가게를 Google에서 찾는다.
 * Google 검색은 비슷한 이름을 넉넉히 돌려주므로, Google이 고른 가게의 이름과 단서 이름 가운데 하나가 다른 하나를 품을 때만 붙인다.
 * 해외 검색의 다지점 규칙은 쓰지 않는다. 국내 결과에서는 덕수궁이나 성심당 본점 같은 단일 장소도 같은 이름이 둘 이상 나와서 막히기 때문이다.
 */
@Slf4j
@Component
public class GoogleDomesticPlaceSearcher implements DomesticFallbackPlaceSearcher {

    private final GooglePlaceCandidateFinder candidateFinder;

    public GoogleDomesticPlaceSearcher(GooglePlacesClient client) {
        this.candidateFinder = new GooglePlaceCandidateFinder(client);
    }

    @Override
    public List<Place> search(PlaceSearchHint hint) {
        List<Place> candidates = candidateFinder.findCandidates(hint, CountryCode.KOREA.value());
        if (candidates.isEmpty()) {
            return List.of();
        }
        Place place = candidates.getFirst();
        if (!nameMatches(hint, place)) {
            log.info("Google이 고른 국내 장소의 이름이 단서와 달라 넣지 않습니다. 단서={}, 장소={}",
                    hint.nameInCaption(), place.profile().name().value());
            return List.of();
        }
        return List.of(place);
    }

    // Google은 「더클라임 연남점, THECLIMB Yeonnam, Seoul」처럼 쉼표 뒤에 영문 이름을 붙이기도 해서, 첫 쉼표 앞 이름만 견준다.
    private boolean nameMatches(PlaceSearchHint hint, Place place) {
        String googleName = normalize(place.profile().name().value().split(",")[0]);
        if (googleName.isEmpty()) {
            return false;
        }
        return GooglePlaceCandidateFinder.searchNames(hint).stream()
                .map(GooglePlaceCandidateFinder::normalize)
                .filter(name -> !name.isEmpty())
                .anyMatch(name -> googleName.contains(name) || name.contains(googleName));
    }
}
