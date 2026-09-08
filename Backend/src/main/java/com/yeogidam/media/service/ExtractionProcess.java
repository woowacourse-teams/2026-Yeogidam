package com.yeogidam.media.service;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.service.CandidatePlaceName;
import com.yeogidam.place.service.PlaceSearcher;
import com.yeogidam.place.service.SearchedPlace;
import com.yeogidam.media.domain.ExtractionFailureReason;
import com.yeogidam.media.domain.MediaShortcode;
import com.yeogidam.media.exception.ExtractionFailedException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 수집 → 추출 → 매칭 세 단계를 순서대로 밟고,
 * 단계별로 멈춘 자리의 실패 사유를 ExtractionFailedException에 실어 올린다.
 */
@Component
public class ExtractionProcess {

    private final InstagramContentReader instagramContentReader;
    private final PlaceNameExtractor placeNameExtractor;
    private final PlaceSearcher placeSearcher;

    public ExtractionProcess(
            InstagramContentReader instagramContentReader,
            PlaceNameExtractor placeNameExtractor,
            PlaceSearcher placeSearcher
    ) {
        this.instagramContentReader = instagramContentReader;
        this.placeNameExtractor = placeNameExtractor;
        this.placeSearcher = placeSearcher;
    }

    public ExtractionOutcome run(MediaShortcode shortcode) {
        InstagramContent content = readContent(shortcode);
        List<CandidatePlaceName> candidates = extractCandidates(content);
        List<SearchedPlace> places = searchAll(candidates);
        return new ExtractionOutcome(content, places);
    }

    private InstagramContent readContent(MediaShortcode shortcode) {
        try {
            return instagramContentReader.read(shortcode);
        } catch (RuntimeException exception) {
            throw new ExtractionFailedException(ExtractionFailureReason.CONTENT_UNAVAILABLE);
        }
    }

    private List<CandidatePlaceName> extractCandidates(InstagramContent content) {
        List<CandidatePlaceName> candidates = placeNameExtractor.extract(content);
        if (candidates.isEmpty()) {
            throw new ExtractionFailedException(ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        }
        return candidates;
    }

    private List<SearchedPlace> searchAll(List<CandidatePlaceName> candidates) {
        List<SearchedPlace> places = candidates.stream()
                .map(placeSearcher::search)
                .flatMap(Optional::stream)
                .filter(this::isStorable)
                .toList();
        List<SearchedPlace> distinctPlaces = distinctByKakaoPlaceId(places);
        if (distinctPlaces.isEmpty()) {
            throw new ExtractionFailedException(ExtractionFailureReason.PLACE_NOT_MATCHED);
        }
        return distinctPlaces;
    }

    /**
     * 서로 다른 후보 이름이 같은 장소로 매칭될 수 있다(상호와 지점명).
     * 같은 장소를 두 번 연결하면 유니크 제약에 걸리므로 먼저 나온 것만 남긴다.
     */
    private List<SearchedPlace> distinctByKakaoPlaceId(List<SearchedPlace> places) {
        Map<String, SearchedPlace> placesById = new LinkedHashMap<>();
        for (SearchedPlace place : places) {
            placesById.putIfAbsent(place.kakaoPlaceId(), place);
        }
        return List.copyOf(placesById.values());
    }

    /**
     * 저장 전 검문소. 값 객체 생성이 곧 검증이라, 만들어 보고 통과 여부만
     * 취한 뒤 버린다. 불량 장소는 이 릴스에서만 빠지고 나머지 장소는 그대로 저장된다.
     */
    private boolean isStorable(SearchedPlace searchedPlace) {
        try {
            new PlaceName(searchedPlace.name());
            new Address(searchedPlace.landLotAddress(), searchedPlace.roadAddress());
            new Coordinate(searchedPlace.latitude(), searchedPlace.longitude());
            new PlaceExternalSource(searchedPlace.kakaoPlaceId(), searchedPlace.kakaoPlaceUrl());
            return true;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }
}
