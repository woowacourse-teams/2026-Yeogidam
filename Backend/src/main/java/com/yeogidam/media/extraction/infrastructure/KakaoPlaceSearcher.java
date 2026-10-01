package com.yeogidam.media.extraction.infrastructure;

import com.yeogidam.media.extraction.config.KakaoLocalProperties;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.LocationHint;
import com.yeogidam.media.extraction.domain.LocationHint.Basis;
import com.yeogidam.media.extraction.domain.LocationHint.Type;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.extraction.service.PlaceSearcher;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.place.domain.PlaceThumbnail;
import java.math.BigDecimal;
import java.net.URI;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;

/**
 * 검색명은 nameSearchHint(오타 등을 Gemini가 보정한 이름)를 우선 사용하고,
 * 지역은 캡션 주소 → 추론 주소(읍·면·동 우선, 없으면 구·군, 그다음 시) → 추론 지역 → 캡션 지역 순으로 선택한다.
 * 중복 없이 붙여 검색하며,
 * 선택한 지역명을 검색명에 공백으로 붙여 '장소명 + 지역' 으로 먼저 검색하고,
 * 장소 목록이 비어 있으면 검색명만으로 다시 검색해 첫 번째 유효 장소를 반환한다.
 */
@Component
@RequiredArgsConstructor
public class KakaoPlaceSearcher implements PlaceSearcher {

    private static final URI API_ENDPOINT = URI.create("https://dapi.kakao.com/v2/local/search/keyword.json");

    private static final int PAGE_SIZE = 15;

    private static final Pattern LOCAL_REGION =
            Pattern.compile("(?<!\\S)([가-힣0-9]+(?:읍|면|동))(?=\\s|$)");

    private static final Pattern ADMINISTRATIVE_REGION =
            Pattern.compile("(?<!\\S)([가-힣]+(?:구|군|시))(?=\\s|$)");

    private final RestClient restClient;
    private final KakaoLocalProperties properties;
    private final URI apiEndpoint;

    @Autowired
    public KakaoPlaceSearcher(
            @Qualifier("kakaoLocalRestClient") RestClient restClient,
            KakaoLocalProperties properties
    ) {
        this(restClient, properties, API_ENDPOINT);
    }

    @Override
    public List<Place> search(PlaceSearchHint hint) {
        List<String> queries = searchQueries(hint);

        for (String query : queries) {
            JsonNode response = requestPage(query);
            List<Place> places = readPlaces(response.path("documents"));

            if (!places.isEmpty()) {
                return List.of(places.getFirst());
            }
        }

        return List.of();
    }

    private List<String> searchQueries(PlaceSearchHint hint) {
        String searchName = placeNameToSearch(hint).strip();

        List<String> queries = new ArrayList<>();
        for (String region : regionCandidates(hint.locationHints())) {
            queries.add(searchQuery(searchName, region));
        }

        // 모든 지역 검색에 실패하면 마지막으로 장소명만 검색
        queries.add(searchName);

        return queries.stream()
                .distinct()
                .toList();
    }

    private String placeNameToSearch(PlaceSearchHint hint) {
        if (hint.nameSearchHint() != null) {
            return hint.nameSearchHint();
        }
        return hint.nameInCaption();
    }

    private List<String> regionCandidates(List<LocationHint> locationHints) {
        // 주소에서 지역을 얻을 수 있으면 그 지역을 우선 검색한다.
        String addressRegion = addressRegion(locationHints, Basis.CAPTION);

        if (addressRegion == null) {
            addressRegion = addressRegion(locationHints, Basis.INFERRED);
        }
        if (addressRegion != null) {
            return List.of(addressRegion);
        }

        // 주소가 없거나 지역을 추출할 수 없을 때 Gemini의 지역 힌트를 사용한다.
        String inferredRegion = regionCandidate(locationHints, Basis.INFERRED);

        if (inferredRegion != null) {
            return List.of(inferredRegion);
        }

        String captionRegion = regionCandidate(locationHints, Basis.CAPTION);

        if (captionRegion == null) {
            return List.of();
        }

        return List.of(captionRegion);
    }

    private String searchQuery(String searchName, String region) {
        if (normalize(searchName).contains(normalize(region))) {
            return searchName;
        }

        return searchName + " " + region;
    }

    private String regionCandidate(
            List<LocationHint> locationHints,
            Basis basis
    ) {
        return locationHints.stream()
                .filter(location ->
                        location.type() == Type.REGION
                                && location.basis() == basis
                )
                .map(LocationHint::value)
                .filter(value -> value != null && !value.isBlank())
                .findFirst()
                .orElse(null);
    }

    private String addressRegion(List<LocationHint> locationHints, Basis basis) {
        return locationHints.stream()
                .filter(location -> location.type() == Type.ADDRESS && location.basis() == basis)
                .map(location -> regionFromAddress(location.value()))
                .filter(region -> region != null && !region.isBlank())
                .findFirst()
                .orElse(null);
    }

    private String regionFromAddress(String address) {
        String localRegion = localRegion(address);
        if (localRegion != null) {
            return localRegion;
        }
        return administrativeRegion(address);
    }

    private String localRegion(String value) {
        Matcher matcher = LOCAL_REGION.matcher(value);
        String region = null;
        while (matcher.find()) {
            region = matcher.group(1);
        }
        return region;
    }

    private String administrativeRegion(String value) {
        Matcher matcher = ADMINISTRATIVE_REGION.matcher(value);

        String city = null;
        String district = null;

        while (matcher.find()) {
            String region = matcher.group(1);
            if (region.endsWith("구") || region.endsWith("군")) {
                district = region;
            } else {
                city = region;
            }
        }
        return district == null ? city : district;
    }

    private JsonNode requestPage(String query) {
        URI uri = UriComponentsBuilder.fromUri(apiEndpoint)
                .queryParam("query", query)
                .queryParam("size", PAGE_SIZE)
                .queryParam("page", 1)
                .build()
                .encode()
                .toUri();
        try {
            JsonNode response = restClient.get()
                    .uri(uri)
                    .header("Authorization", "KakaoAK " + properties.apiKey())
                    .retrieve()
                    .body(JsonNode.class);
            if (response == null || !response.path("documents").isArray()) {
                throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED);
            }
            return response;
        } catch (RestClientException exception) {
            throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED, exception);
        }
    }

    private List<Place> readPlaces(JsonNode documents) {
        Map<String, Place> places = new LinkedHashMap<>();

        for (JsonNode document : documents) {
            readPlace(document)
                    .ifPresent(place -> places.putIfAbsent(place.externalSource().placeId(), place));
        }
        if (!documents.isEmpty() && places.isEmpty()) {
            throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED);
        }
        return List.copyOf(places.values());
    }

    private Optional<Place> readPlace(JsonNode document) {
        try {
            PlaceExternalSource externalSource = new PlaceExternalSource(required(document, "id"), optional(document, "place_url"));

            PlaceProfile profile =
                    new PlaceProfile(
                            new PlaceName(
                                    required(document, "place_name")
                            ),
                            new Address(
                                    required(document, "address_name"),
                                    optional(document, "road_address_name")
                            ),
                            new Coordinate(
                                    new BigDecimal(
                                            required(document, "y")
                                    ),
                                    new BigDecimal(
                                            required(document, "x")
                                    )
                            ),
                            optional(document, "category_name"),
                            optional(document, "phone"),
                            new PlaceThumbnail(null, null)
                    );
            return Optional.of(new Place(null, externalSource, profile));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    private String required(JsonNode document, String field) {
        String value = optional(document, field);

        if (value == null) {
            throw new IllegalArgumentException("카카오 장소 검색 결과의 필수 필드가 비어 있습니다: " + field);
        }
        return value;
    }

    private String optional(JsonNode document, String field) {
        String value = document.path(field).asString();
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }

    private String normalize(String value) {
        if (value == null) {
            return "";
        }
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[\\p{Z}\\p{P}\\p{S}\\s]", "");
    }
}
