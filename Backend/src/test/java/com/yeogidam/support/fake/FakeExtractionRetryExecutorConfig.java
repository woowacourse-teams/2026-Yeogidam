package com.yeogidam.support.fake;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * 재시도와 제보로 접수된 추출 작업을 단계별 FakeExtractionRetryExecutor가 받아 테스트가 완료를 기다릴 수 있게 한다.
 * 메타데이터 작업이 분석 작업을 넘기므로 두 단계의 실행기를 각각 Fake로 바꾼다.
 */
@TestConfiguration
public class FakeExtractionRetryExecutorConfig {

    @Primary
    @Bean(destroyMethod = "close")
    @Qualifier("mediaMetadataExecutor")
    public FakeExtractionRetryExecutor fakeExtractionRetryExecutor() {
        return new FakeExtractionRetryExecutor();
    }

    @Primary
    @Bean(destroyMethod = "close")
    @Qualifier("mediaAnalysisExecutor")
    public FakeExtractionRetryExecutor fakeAnalysisExecutor() {
        return new FakeExtractionRetryExecutor();
    }
}
