package com.yeogidam.support.fake;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * E2E 컨텍스트에서 네이버 블로그 검색 대신 FakeBlogSearcher를 쓰게 한다.
 * 모든 E2E가 같은 인스턴스를 공유하므로 응답을 바꾸는 테스트는 매번 reset으로 시작한다.
 */
@TestConfiguration
public class FakeBlogSearcherConfig {

    @Bean
    @Primary
    public FakeBlogSearcher fakeBlogSearcher() {
        return new FakeBlogSearcher();
    }
}
