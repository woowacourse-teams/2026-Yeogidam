package com.yeogidam.media.extraction.config;

import java.util.List;
import java.util.stream.Stream;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * apiKey는 먼저 부르는 key(무료 등급)이고, fallbackApiKeys는 앞 key가 한도나 오류로 막혔을 때 차례로 부르는 key(결제 등급)다.
 */
@ConfigurationProperties("media.extraction.gemini")
public record GeminiProperties(
        String apiKey,
        String model,
        List<String> fallbackApiKeys
) {
    public GeminiProperties {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("Gemini API 키는 필수입니다.");
        }
        if (model == null || model.isBlank()) {
            throw new IllegalArgumentException("Gemini 모델 이름은 필수입니다.");
        }
        if (fallbackApiKeys == null) {
            fallbackApiKeys = List.of();
        }
        fallbackApiKeys = fallbackApiKeys.stream()
                .filter(key -> key != null && !key.isBlank())
                .map(String::strip)
                .toList();
    }

    /** 부를 순서대로 모든 key를 돌려준다. 같은 key가 두 번 적혀 있으면 한 번만 넣는다. */
    public List<String> apiKeysInOrder() {
        return Stream.concat(Stream.of(apiKey.strip()), fallbackApiKeys.stream())
                .distinct()
                .toList();
    }
}
