package com.yeogidam.media.extraction.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("media.extraction.executor")
public record ExtractionExecutorProperties(Stage metadata, Stage analysis) {

    public record Stage(int coreSize, int queueCapacity) {

        public Stage {
            if (coreSize < 1 || queueCapacity < 0) {
                throw new IllegalArgumentException("추출 코어 스레드 수는 1 이상, 대기 허용량은 0 이상이어야 합니다.");
            }
        }
    }
}
