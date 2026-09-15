package com.yeogidam.support;

import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.JdbcTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * DB 쿼리와 매핑을 검증하는 슬라이스의 공통 바닥. 검증할 DAO만 @Import로 더한다.
 * @JdbcTest의 내장 DB 바꿔치기를 끄고 컨테이너의 MySQL을 그대로 쓰며, 각 테스트는 트랜잭션 롤백으로 격리된다.
 */
@JdbcTest
@ActiveProfiles("test")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
public abstract class JdbcTestSupport extends MySqlContainerSupport {
}
