package com.yeogidam.support;

import static org.springframework.test.context.jdbc.Sql.ExecutionPhase.BEFORE_TEST_METHOD;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;

/**
 * 서비스와 DB가 함께 만드는 최종 상태를 검증하는 통합 테스트의 공통 바닥.
 * 각 테스트 시작 전에 cleanup.sql로 테이블을 비워 테스트 간 격리를 보장한다.
 */
@ActiveProfiles("test")
@Sql(scripts = "/cleanup.sql", executionPhase = BEFORE_TEST_METHOD)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
public abstract class IntegrationTestSupport extends MySqlContainerSupport {
}
