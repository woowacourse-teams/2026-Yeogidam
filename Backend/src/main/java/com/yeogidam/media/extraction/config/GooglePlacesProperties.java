package com.yeogidam.media.extraction.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** 해외 장소를 찾는 Google Places API (New) 키. 비워 두면 해외 장소 단서는 찾지 못한 것으로 끝난다. */
@ConfigurationProperties("media.extraction.google")
public record GooglePlacesProperties(String apiKey) {

    public GooglePlacesProperties {
        if (apiKey != null && apiKey.isBlank()) {
            apiKey = null;
        }
    }

    public boolean enabled() {
        return apiKey != null;
    }
}
