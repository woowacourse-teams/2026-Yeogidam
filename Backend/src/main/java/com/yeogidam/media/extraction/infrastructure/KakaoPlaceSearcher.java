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
import java.util.Objects;
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
 * 검색명은 nameSearchHint(오타 등을 Gemini가 보정한 이름)를 우선 사용한다.
 * 캡션 주소가 있으면 카카오 주소 검색으로 좌표를 얻어 그 반경 안에서만 찾고, 반경 안에 없으면 찾지 못한 것으로 둔다.
 * 지역이나 이름만으로 다시 찾으면 카카오가 다른 지점을 돌려주기 때문이다. 영상, 이미지에서 읽은 주소와 추론 주소는 단서일 뿐이라
 * 반경 안에서 먼저 찾되, 없으면 지역을 캡션, 영상, 이미지, 추론 주소(읍, 면, 동 우선, 없으면 구, 군, 그다음 시)와
 * 영상, 이미지, 추론, 캡션 지역 순으로 골라 '장소명 + 지역'으로 검색하고, 장소 목록이 비어 있으면 검색명만으로 다시 검색해
 * 첫 번째 유효 장소를 반환한다.
 */
@Component
@RequiredArgsConstructor
public class KakaoPlaceSearcher implements PlaceSearcher {

    private static final URI API_ENDPOINT = URI.create("https://dapi.kakao.com/v2/local/search/keyword.json");

    private static final int PAGE_SIZE = 15;

    private static final String FOOD_CATEGORY_PREFIX = "음식점";

    // 주소 좌표를 기준으로 같은 이름의 장소를 찾는 반경. 같은 도시 안의 다른 지점(골든셋에서 4.8km 밖 지점이 붙은 일이 있었다)은
    // 거르고 같은 동네 안에서는 넉넉한 값이다.
    private static final int NEARBY_RADIUS_METERS = 3_000;

    // 주소 뒤에 붙은 층, 호수, 건물명 때문에 주소 검색이 비면 끝 낱말을 하나씩 떼고 다시 찾는 최대 횟수
    private static final int ADDRESS_TRIM_ATTEMPTS = 3;

    private static final List<Basis> ADDRESS_BASES = List.of(
            Basis.CAPTION, Basis.VIDEO, Basis.IMAGE, Basis.INFERRED);
    private static final List<Basis> REGION_BASES = List.of(
            Basis.VIDEO, Basis.IMAGE, Basis.INFERRED, Basis.CAPTION);

    // 근처를 먼저 찾되 없으면 지역과 이름으로 다시 찾는 주소의 출처. Gemini가 영상 속 지명을 틀리게 적거나
    // 동 이름이 겹치는 다른 구로 좌표가 잡히는 일이 있어(골든셋 C005), 캡션 주소처럼 반경 안에만 묶지 않는다.
    private static final List<Basis> SOFT_ADDRESS_BASES = List.of(Basis.VIDEO, Basis.IMAGE, Basis.INFERRED);

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
        Coordinate captionAnchor = anchorCoordinate(hint.locationHints(), Basis.CAPTION);
        if (captionAnchor != null) {
            // 캡션에 적힌 주소는 사실이라 그 근처만 믿는다. 근처에 없는 가게를 지역이나 이름만으로 찾으면 다른 지점이 붙는다.
            return searchNearby(hint, captionAnchor);
        }
        Coordinate softAnchor = softAnchor(hint.locationHints());
        if (softAnchor != null) {
            // 영상, 이미지에서 읽거나 프로필 등에서 추론한 주소는 단서일 뿐이라, 근처에 없으면 지역과 이름으로 다시 찾는다.
            List<Place> nearby = searchNearby(hint, softAnchor);
            if (!nearby.isEmpty()) {
                return nearby;
            }
        }

        for (String query : searchQueries(hint)) {
            JsonNode response = requestPage(query);
            List<Place> places = readPlaces(response.path("documents"));

            if (!places.isEmpty()) {
                return List.of(places.getFirst());
            }
        }

        return List.of();
    }

    private List<Place> searchNearby(PlaceSearchHint hint, Coordinate anchor) {
        JsonNode response = requestNearby(placeNameToSearch(hint).strip(), anchor);
        List<Place> places = readPlaces(response.path("documents"));
        if (places.isEmpty()) {
            return List.of();
        }
        return List.of(places.getFirst());
    }

    private Coordinate softAnchor(List<LocationHint> locationHints) {
        for (Basis basis : SOFT_ADDRESS_BASES) {
            Coordinate coordinate = anchorCoordinate(locationHints, basis);
            if (coordinate != null) {
                return coordinate;
            }
        }
        return null;
    }

    private Coordinate anchorCoordinate(List<LocationHint> locationHints, Basis basis) {
        for (LocationHint location : locationHints) {
            if (location.type() != Type.ADDRESS || location.basis() != basis) {
                continue;
            }
            Coordinate coordinate = geocode(location.value());
            if (coordinate != null) {
                return coordinate;
            }
        }
        return null;
    }

    private Coordinate geocode(String address) {
        String query = address.strip();
        for (int attempt = 0; attempt <= ADDRESS_TRIM_ATTEMPTS && !query.isBlank(); attempt++) {
            Coordinate coordinate = readCoordinate(requestAddress(query).path("documents"));
            if (coordinate != null) {
                return coordinate;
            }
            query = withoutLastWord(query);
        }
        return null;
    }

    private String withoutLastWord(String query) {
        int lastSpace = query.lastIndexOf(' ');
        if (lastSpace < 0) {
            return "";
        }
        return query.substring(0, lastSpace).strip();
    }

    private Coordinate readCoordinate(JsonNode documents) {
        for (JsonNode document : documents) {
            String latitude = optional(document, "y");
            String longitude = optional(document, "x");
            if (latitude != null && longitude != null) {
                return new Coordinate(new BigDecimal(latitude), new BigDecimal(longitude));
            }
        }
        return null;
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
        String addressRegion = ADDRESS_BASES.stream()
                .map(basis -> addressRegion(locationHints, basis))
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
        if (addressRegion != null) {
            return List.of(addressRegion);
        }

        // 주소가 없거나 지역을 추출할 수 없을 때 Gemini의 지역 힌트를 사용한다.
        return REGION_BASES.stream()
                .map(basis -> regionCandidate(locationHints, basis))
                .filter(Objects::nonNull)
                .findFirst()
                .stream()
                .toList();
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
        return request(uri);
    }

    // 좌표 반경 안으로 결과를 좁힌다. 같은 이름의 다른 도시 지점이 먼저 오는 일을 막는다.
    // 정렬은 카카오 기본값(정확도)을 둔다. 거리순으로 바꾸면 같은 건물의 다른 가게가 앞에 오는 일이 있었다.
    private JsonNode requestNearby(String query, Coordinate anchor) {
        URI uri = UriComponentsBuilder.fromUri(apiEndpoint)
                .queryParam("query", query)
                .queryParam("x", anchor.longitude().toPlainString())
                .queryParam("y", anchor.latitude().toPlainString())
                .queryParam("radius", NEARBY_RADIUS_METERS)
                .queryParam("size", PAGE_SIZE)
                .queryParam("page", 1)
                .build()
                .encode()
                .toUri();
        return request(uri);
    }

    // 주소 검색은 키워드 검색과 같은 경로 아래의 address.json이다.
    private JsonNode requestAddress(String address) {
        URI uri = UriComponentsBuilder.fromUri(apiEndpoint.resolve("address.json"))
                .queryParam("query", address)
                .queryParam("size", 1)
                .build()
                .encode()
                .toUri();
        return request(uri);
    }

    private JsonNode request(URI uri) {
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
        int foodDocuments = 0;

        for (JsonNode document : documents) {
            if (!isFoodPlace(document)) {
                continue;
            }
            foodDocuments++;
            readPlace(document)
                    .ifPresent(place -> places.putIfAbsent(place.externalSource().placeId(), place));
        }
        // 음식점 결과가 왔는데 하나도 못 읽었다면 응답 모양이 바뀐 것이다. 음식점이 아예 없는 것은 정상이다.
        if (foodDocuments > 0 && places.isEmpty()) {
            throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED);
        }
        return List.copyOf(places.values());
    }

    // 여기담은 먹고 마시는 가게만 모은다. 카카오 분류가 "음식점"으로 시작하지 않는 결과(관광지, 공원, 편의점 등)는 받지 않는다.
    private boolean isFoodPlace(JsonNode document) {
        String category = optional(document, "category_name");
        return category != null && category.startsWith(FOOD_CATEGORY_PREFIX);
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
