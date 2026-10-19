package com.yeogidam.place.domain;

/** 장소 대표 사진의 S3 객체 키와 출처. 사진이 없을 수도 있어 검증하지 않는다. */
public record PlaceThumbnail(
        String key,
        String source
) {
}
