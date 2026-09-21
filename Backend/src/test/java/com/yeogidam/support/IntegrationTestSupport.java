package com.yeogidam.support;

import static org.springframework.test.context.jdbc.Sql.ExecutionPhase.BEFORE_TEST_METHOD;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.transaction.annotation.Transactional;

/**
 * 서비스와 DB가 함께 만드는 최종 상태를 검증하는 통합 테스트의 공통 바닥.
 * 시작 전에 cleanup.sql로 테이블을 비워 다른 클래스가 남긴 행에 기대지 않고, 끝나면 트랜잭션 롤백으로 자기 행을 되돌린다.
 */
@Transactional
@SpringBootTest
@ActiveProfiles("test")
@Sql(scripts = "/cleanup.sql", executionPhase = BEFORE_TEST_METHOD)
public abstract class IntegrationTestSupport extends MySqlContainerSupport {
}
