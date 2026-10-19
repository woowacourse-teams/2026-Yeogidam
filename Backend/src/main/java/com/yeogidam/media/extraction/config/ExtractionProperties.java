package com.yeogidam.media.extraction.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("media.extraction")
public record ExtractionProperties(int pipelineVersion) {

    public ExtractionProperties {
        if (pipelineVersion < 1) {
            throw new IllegalArgumentException("추출 파이프라인 버전은 1 이상이어야 합니다.");
        }
    }
}
