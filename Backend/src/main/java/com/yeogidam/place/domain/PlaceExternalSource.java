package com.yeogidam.place.domain;

import java.net.URI;

/**
 * 외부 시스템(카카오)에서의 이 장소의 정체성.
 * placeId는 다음 cycle의 중복 제거 키가 될 값이라 필수로 검증한다.
 * placeUrl은 "카카오맵으로 바로가기" 버튼용 표시 값이라, 불량이면
 * 장소를 버리는 대신 null로 정규화해 버튼만 포기한다.
 */
public record PlaceExternalSource(
        String placeId,
        String placeUrl
) {

    public PlaceExternalSource {
        if (placeId == null || placeId.isBlank()) {
            throw new IllegalArgumentException("외부 장소 식별자가 비어 있습니다.");
        }
        if (placeUrl != null && !isHttpUrl(placeUrl)) {
            placeUrl = null;
        }
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
