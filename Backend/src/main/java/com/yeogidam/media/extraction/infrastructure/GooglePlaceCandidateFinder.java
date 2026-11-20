package com.yeogidam.media.extraction.infrastructure;

import com.yeogidam.media.extraction.domain.LocationHint;
import com.yeogidam.media.extraction.domain.LocationHint.Basis;
import com.yeogidam.media.extraction.domain.LocationHint.Type;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.CountryCode;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.place.domain.PlaceThumbnail;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import tools.jackson.databind.JsonNode;

/**
 * Google Places API (New)의 Text Search로 장소 단서의 후보를 찾는다. 해외 검색과 국내 보조 검색이 함께 쓴다.
 * 원문 nameInCaption, 보정한 nameSearchHint 순으로 '장소명 + 주소나 지역'을 먼저 찾고, 모두 비면 장소명만 찾는다.
 * 캡션에 주소가 있으면 카카오 검색처럼 캡션 주소로 찾은 결과만 믿고 장소명만으로는 다시 찾지 않는다.
 * 결과의 나라가 찾는 나라와 다르면 버려서, 같은 이름의 다른 나라 가게가 붙지 않게 한다. 도시나 행정구역 같은 지역 결과도 버린다.
 * 후보 가운데 무엇을 붙일지는 부르는 검색기가 정한다.
 */
final class GooglePlaceCandidateFinder {

    // Google place ID는 길이 상한이 정해져 있지 않아서, places.external_place_id(VARCHAR(255))를 넘는 ID는 버린다.
    private static final int MAX_EXTERNAL_ID_LENGTH = 255;

    // 도시, 행정구역, 나라 같은 지역 결과의 유형. 가게나 시설이 아니라서 저장하지 않는다.
    private static final Set<String> REGION_TYPES = Set.of(
            "country", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3",
            "administrative_area_level_4", "locality", "sublocality", "sublocality_level_1", "neighborhood",
            "colloquial_area", "postal_code");

    private static final List<Basis> ADDRESS_BASES = List.of(
            Basis.CAPTION, Basis.VIDEO, Basis.IMAGE, Basis.INFERRED);
    private static final List<Basis> REGION_BASES = List.of(
            Basis.VIDEO, Basis.IMAGE, Basis.INFERRED, Basis.CAPTION);

    private final GooglePlacesClient client;

    GooglePlaceCandidateFinder(GooglePlacesClient client) {
        this.client = client;
    }

    /**
     * 검색어를 차례로 부르고, 나라 안의 가게나 시설 후보가 처음 나온 검색어의 후보를 Google 순서대로 돌려준다.
     * Google 호출이 실패하거나 모든 검색어에서 후보가 없으면 빈 목록이다.
     */
    List<Place> findCandidates(PlaceSearchHint hint, String countryCode) {
        for (String query : searchQueries(hint)) {
            Optional<JsonNode> response = client.searchText(query, countryCode);
            if (response.isEmpty()) {
                return List.of();
            }
            List<Place> candidates = candidatesInCountry(response.get(), countryCode);
            if (!candidates.isEmpty()) {
                return candidates;
            }
        }
        return List.of();
    }

    static List<String> searchNames(PlaceSearchHint hint) {
        List<String> names = new ArrayList<>();
        names.add(hint.nameInCaption().strip());
        if (hint.nameSearchHint() != null) {
            names.add(hint.nameSearchHint().strip());
        }
        return names.stream()
                .distinct()
                .toList();
    }

    // 「一蘭 渋谷店」와 「一蘭渋谷店」처럼 띄어쓰기, 문장 부호, 전각 문자만 다른 이름을 같게 본다.
    static String normalize(String value) {
        return Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[\\p{Z}\\p{P}\\p{S}\\s]", "");
    }

    private List<String> searchQueries(PlaceSearchHint hint) {
        List<String> names = searchNames(hint);
        String location = location(hint.locationHints());
        List<String> queries = new ArrayList<>();
        if (location != null) {
            names.forEach(name -> queries.add(withLocation(name, location)));
        }
        // 캡션에 적힌 주소는 사실이라, 캡션 주소로 못 찾은 가게를 이름만으로 찾으면 같은 나라의 다른 지점이 붙는다.
        if (hasCaptionAddress(hint.locationHints())) {
            return List.copyOf(queries);
        }
        // 주소나 지역을 붙인 검색이 모두 비면 장소명만 찾는다. 나라가 다른 결과는 버리므로 다른 나라 가게는 붙지 않는다.
        queries.addAll(names);
        return queries.stream()
                .distinct()
                .toList();
    }

    private boolean hasCaptionAddress(List<LocationHint> locationHints) {
        return locationHints.stream()
                .anyMatch(location -> location.type() == Type.ADDRESS && location.basis() == Basis.CAPTION);
    }

    // 주소가 있으면 주소를, 없으면 지역을 붙인다. 출처 순서는 카카오 검색과 같다.
    private String location(List<LocationHint> locationHints) {
        return firstValue(locationHints, Type.ADDRESS, ADDRESS_BASES)
                .or(() -> firstValue(locationHints, Type.REGION, REGION_BASES))
                .orElse(null);
    }

    private Optional<String> firstValue(List<LocationHint> locationHints, Type type, List<Basis> bases) {
        for (Basis basis : bases) {
            Optional<String> value = locationHints.stream()
                    .filter(location -> location.type() == type && location.basis() == basis)
                    .map(location -> location.value().strip())
                    .findFirst();
            if (value.isPresent()) {
                return value;
            }
        }
        return Optional.empty();
    }

    private String withLocation(String name, String location) {
        if (name.toLowerCase(Locale.ROOT).contains(location.toLowerCase(Locale.ROOT))) {
            return name;
        }
        return name + " " + location;
    }

    private List<Place> candidatesInCountry(JsonNode response, String countryCode) {
        List<Place> candidates = new ArrayList<>();
        for (JsonNode document : response.path("places")) {
            if (countryCode.equals(country(document)) && !isRegion(document)) {
                readPlace(document).ifPresent(candidates::add);
            }
        }
        return List.copyOf(candidates);
    }

    // 「드레스덴」처럼 도시 이름을 장소로 찾으면 Google은 도시 자체를 돌려준다. 가게나 시설 유형이 함께 있으면 지역으로 보지 않는다.
    private boolean isRegion(JsonNode document) {
        List<String> types = texts(document.path("types"));
        return types.stream().anyMatch(REGION_TYPES::contains)
                && !types.contains("establishment")
                && !types.contains("point_of_interest");
    }

    private String country(JsonNode document) {
        for (JsonNode component : document.path("addressComponents")) {
            for (JsonNode type : component.path("types")) {
                if ("country".equals(type.asString())) {
                    return component.path("shortText").asString();
                }
            }
        }
        return null;
    }

    private Optional<Place> readPlace(JsonNode document) {
        try {
            PlaceExternalSource externalSource =
                    PlaceExternalSource.google(required(document.path("id"), "id"));
            if (externalSource.placeId().length() > MAX_EXTERNAL_ID_LENGTH) {
                return Optional.empty();
            }
            PlaceProfile profile = new PlaceProfile(
                    new PlaceName(required(document.path("displayName").path("text"), "displayName")),
                    new Address(required(document.path("formattedAddress"), "formattedAddress"), null,
                            new CountryCode(country(document))),
                    new Coordinate(
                            decimal(document.path("location").path("latitude")),
                            decimal(document.path("location").path("longitude"))),
                    GooglePlaceCategory.toKakaoCategory(
                            optional(document.path("primaryType")), texts(document.path("types"))),
                    null,
                    new PlaceThumbnail(null, null));
            return Optional.of(new Place(null, externalSource, profile));
        } catch (IllegalArgumentException exception) {
            return Optional.empty();
        }
    }

    private String required(JsonNode node, String field) {
        String value = optional(node);
        if (value == null) {
            throw new IllegalArgumentException("구글 장소 검색 결과의 필수 필드가 비어 있습니다: " + field);
        }
        return value;
    }

    private String optional(JsonNode node) {
        String value = node.asString();
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }

    private BigDecimal decimal(JsonNode node) {
        if (!node.isNumber()) {
            throw new IllegalArgumentException("구글 장소 검색 결과의 좌표가 비어 있습니다.");
        }
        return node.decimalValue();
    }

    private List<String> texts(JsonNode array) {
        List<String> values = new ArrayList<>();
        for (JsonNode item : array) {
            values.add(item.asString());
        }
        return List.copyOf(values);
    }
}
