package com.yeogidam.media.extraction.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("media.extraction.gemini")
public record GeminiProperties(
        String apiKey,
        String model
) {
    public GeminiProperties {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("Gemini API 키는 필수입니다.");
        }
        if (model == null || model.isBlank()) {
            throw new IllegalArgumentException("Gemini 모델 이름은 필수입니다.");
        }
    }
}
