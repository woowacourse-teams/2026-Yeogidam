package com.yeogidam.media.extraction.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("media.extraction.pool")
public record ExtractionPoolProperties(int coreSize, int maxSize, int queueCapacity) {

    public ExtractionPoolProperties {
        if (coreSize < 1 || maxSize < coreSize || queueCapacity < 0) {
            throw new IllegalArgumentException("추출 스레드 풀은 1 <= 코어 수 <= 최대 스레드 수이고 큐 크기는 0 이상이어야 합니다.");
        }
    }
}
