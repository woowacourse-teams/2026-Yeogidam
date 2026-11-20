package com.yeogidam.place.domain;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * 외부 시스템(카카오, 구글)에서의 이 장소의 정체성.
 * 지도 제공자와 제공자 쪽 장소 ID가 함께 중복 제거 키라서 둘 다 필수로 검증한다.
 * kakaoPlaceUrl은 카카오 검색 결과로 받아 저장한 "카카오맵으로 바로가기" 버튼용 값이라, 불량이면
 * 장소를 버리는 대신 null로 정규화해 버튼만 포기한다. 구글 장소는 링크를 저장하지 않아서 늘 null이다.
 */
public record PlaceExternalSource(
        MapProvider mapProvider,
        String placeId,
        String kakaoPlaceUrl
) {

    private static final String GOOGLE_MAPS_URL = "https://www.google.com/maps/search/?api=1&query=%s&query_place_id=%s";

    public PlaceExternalSource {
        if (mapProvider == null) {
            throw new IllegalArgumentException("지도 제공자가 비어 있습니다.");
        }
        if (placeId == null || placeId.isBlank()) {
            throw new IllegalArgumentException("외부 장소 식별자가 비어 있습니다.");
        }
        if (kakaoPlaceUrl != null && !isHttpUrl(kakaoPlaceUrl)) {
            kakaoPlaceUrl = null;
        }
    }

    public static PlaceExternalSource kakao(String kakaoPlaceId, String kakaoPlaceUrl) {
        return new PlaceExternalSource(MapProvider.KAKAO, kakaoPlaceId, kakaoPlaceUrl);
    }

    public static PlaceExternalSource google(String googlePlaceId) {
        return new PlaceExternalSource(MapProvider.GOOGLE, googlePlaceId, null);
    }

    /**
     * 장소를 지도 앱에서 여는 링크다. 카카오 장소는 저장한 카카오맵 링크이고,
     * 구글 장소는 Google 약관이 place ID 말고는 저장하지 못하게 해서 place ID로 구글맵 링크를 만든다.
     */
    public String mapUrl(String placeName) {
        return switch (mapProvider) {
            case KAKAO -> kakaoPlaceUrl;
            case GOOGLE -> GOOGLE_MAPS_URL.formatted(encode(placeName), encode(placeId));
        };
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private boolean isHttpUrl(String placeUrl) {
        try {
            URI uri = URI.create(placeUrl);
            return isHttp(uri) && uri.getHost() != null;
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private boolean isHttp(URI uri) {
        return "http".equalsIgnoreCase(uri.getScheme())
                || "https".equalsIgnoreCase(uri.getScheme());
    }
}
