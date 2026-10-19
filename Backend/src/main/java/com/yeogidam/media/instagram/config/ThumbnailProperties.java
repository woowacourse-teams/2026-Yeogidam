package com.yeogidam.media.instagram.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("media.thumbnail")
public record ThumbnailProperties(
        String publicBaseUrl,
        String bucket,
        String region,
        String instagramKeyPrefix,
        String placeKeyPrefix
) {
    public ThumbnailProperties {
        validate(bucket, "S3 버킷 이름");
        validate(region, "AWS 리전");
        validate(instagramKeyPrefix, "인스타그램 썸네일 S3 객체 경로 접두어");
        validate(placeKeyPrefix, "장소 썸네일 S3 객체 경로 접두어");
    }

    private static void validate(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(name + "은 비어 있을 수 없습니다.");
        }
    }
}
