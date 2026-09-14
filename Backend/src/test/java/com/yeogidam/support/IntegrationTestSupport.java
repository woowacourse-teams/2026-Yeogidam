package com.yeogidam.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * 서비스와 DB가 함께 만드는 최종 상태를 검증하는 통합 테스트의 공통 바닥. 각 테스트는 트랜잭션 롤백으로 격리된다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
public abstract class IntegrationTestSupport extends MySqlContainerSupport {
}
