package com.yeogidam.media.extraction.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("media.extraction.kakao")
public record KakaoLocalProperties(String apiKey) {
    public KakaoLocalProperties {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("카카오 로컬 REST API 키는 필수입니다.");
        }
    }
}
