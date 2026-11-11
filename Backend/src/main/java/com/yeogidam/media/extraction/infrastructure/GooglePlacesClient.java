package com.yeogidam.media.extraction.infrastructure;

import com.yeogidam.media.extraction.config.GooglePlacesProperties;
import java.net.URI;
import java.util.Map;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;

/**
 * Google Places API (New)의 Text Search를 부른다. 어떤 검색어로 찾고 나라와 지역 결과를 어떻게 거를지는 GooglePlaceCandidateFinder가 정하고,
 * 거르고 남은 후보 가운데 무엇을 붙일지는 GoogleOverseasPlaceSearcher가 정한다.
 * 키가 없거나 호출이 실패하면 빈 값을 돌려줘서, 호출한 쪽은 찾지 못한 것으로 다룬다.
 */
@Slf4j
@Component
public class GooglePlacesClient {

    private static final URI API_ENDPOINT = URI.create("https://places.googleapis.com/v1/places:searchText");

    // 무료 구간이 넓은 Text Search Pro 등급 필드만 받는다. 전화번호와 영업시간은 Enterprise 등급이라 받지 않는다.
    private static final String FIELD_MASK = String.join(",",
            "places.id", "places.displayName", "places.formattedAddress", "places.location",
            "places.primaryType", "places.types", "places.addressComponents");

    // 한국어 표기가 있는 장소는 상호와 주소를 한국어로 받는다.
    private static final String LANGUAGE_CODE = "ko";

    private static final int PAGE_SIZE = 5;

    private final RestClient restClient;
    private final GooglePlacesProperties properties;
    private final URI apiEndpoint;

    @Autowired
    public GooglePlacesClient(
            @Qualifier("googlePlacesRestClient") RestClient restClient,
            GooglePlacesProperties properties
    ) {
        this(restClient, properties, API_ENDPOINT);
    }

    GooglePlacesClient(RestClient restClient, GooglePlacesProperties properties, URI apiEndpoint) {
        this.restClient = restClient;
        this.properties = properties;
        this.apiEndpoint = apiEndpoint;
        if (!properties.enabled()) {
            log.warn("GOOGLE_PLACES_API_KEY가 없어서 해외 장소 단서는 찾지 않고 장소를 찾지 못한 것으로 남깁니다.");
        }
    }

    public boolean isEnabled() {
        return properties.enabled();
    }

    /**
     * 검색어를 나라(regionCode) 안에서 찾은 응답을 돌려준다. 결과가 없으면 Google은 places 없이 빈 객체를 준다.
     */
    public Optional<JsonNode> searchText(String query, String countryCode) {
        if (!isEnabled()) {
            return Optional.empty();
        }
        Map<String, Object> body = Map.of(
                "textQuery", query,
                "languageCode", LANGUAGE_CODE,
                "regionCode", countryCode,
                "pageSize", PAGE_SIZE);
        try {
            JsonNode response = restClient.post()
                    .uri(apiEndpoint)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("X-Goog-Api-Key", properties.apiKey())
                    .header("X-Goog-FieldMask", FIELD_MASK)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            if (response == null) {
                log.warn("Google Places 검색 응답이 비어 있습니다. 나라={}", countryCode);
                return Optional.empty();
            }
            return Optional.of(response);
        } catch (RestClientException exception) {
            log.warn("Google Places 검색에 실패했습니다. 나라={}", countryCode, exception);
            return Optional.empty();
        }
    }
}
