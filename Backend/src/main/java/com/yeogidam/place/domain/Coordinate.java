package com.yeogidam.place.domain;

import java.math.BigDecimal;

public record Coordinate(
        BigDecimal latitude,
        BigDecimal longitude
) {

    private static final BigDecimal LATITUDE_LIMIT = BigDecimal.valueOf(90);
    private static final BigDecimal LONGITUDE_LIMIT = BigDecimal.valueOf(180);

    public Coordinate {
        if (latitude == null || longitude == null) {
            throw new IllegalArgumentException("좌표가 비어 있습니다.");
        }
        if (latitude.abs().compareTo(LATITUDE_LIMIT) > 0) {
            throw new IllegalArgumentException("위도 범위를 벗어났습니다: " + latitude);
        }
        if (longitude.abs().compareTo(LONGITUDE_LIMIT) > 0) {
            throw new IllegalArgumentException("경도 범위를 벗어났습니다: " + longitude);
        }
    }
}
