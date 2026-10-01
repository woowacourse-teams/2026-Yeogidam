package com.yeogidam.media.extraction.domain;

/**
 * 장소를 지도에서 좁힐 때 사용할 주소 또는 지역 단서.
 */
public record LocationHint(
        Type type,
        String value,
        Basis basis
) {
    public LocationHint {
        if (type == null || basis == null || value == null || value.isBlank()) {
            throw new IllegalArgumentException("위치 단서의 종류, 값, 근거는 필수입니다.");
        }
    }

    public enum Type {
        ADDRESS,
        REGION

    }

    public enum Basis {
        CAPTION,
        INFERRED

    }
}
