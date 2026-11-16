package com.yeogidam.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.stereotype.Repository;

/**
 * DAO 테스트가 하나의 스프링 컨텍스트를 함께 쓰도록 모든 @Repository 빈을 등록한다.
 * 테스트 클래스마다 다른 DAO를 @Import하면 컨텍스트 캐시 키가 달라져 DAO 수만큼 컨텍스트가 뜬다.
 * 조건부 DAO(@ConditionalOnProperty 등)는 조건을 그대로 따른다.
 */
@TestConfiguration
@ComponentScan(
        basePackages = "com.yeogidam",
        useDefaultFilters = false,
        includeFilters = @ComponentScan.Filter(type = FilterType.ANNOTATION, classes = Repository.class)
)
public class RepositoryScanConfig {
}
