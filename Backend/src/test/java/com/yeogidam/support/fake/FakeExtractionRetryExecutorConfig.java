package com.yeogidam.support.fake;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * 재시도와 제보로 접수된 추출 작업을 FakeExtractionRetryExecutor가 받아 테스트가 완료를 기다릴 수 있게 한다.
 */
@TestConfiguration
public class FakeExtractionRetryExecutorConfig {

    @Primary
    @Bean(destroyMethod = "close")
    public FakeExtractionRetryExecutor fakeExtractionRetryExecutor() {
        return new FakeExtractionRetryExecutor();
    }
}
