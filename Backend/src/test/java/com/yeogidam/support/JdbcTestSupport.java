package com.yeogidam.support;

import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.JdbcTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.context.jdbc.SqlConfig;

/**
 * DAO의 SQL과 조회 결과를 검증하는 테스트의 공통 설정이다. 검증할 DAO는 @Import로 추가한다.
 * 내장 DB 대신 테스트 컨테이너의 MySQL을 사용한다.
 * 각 테스트 전에 cleanup.sql로 이전 데이터를 비우고 자동 증가 ID를 초기화한다.
 * cleanup.sql의 TRUNCATE는 MySQL에서 실행 중인 트랜잭션을 자동으로 커밋한다.
 * ISOLATED가 없으면 정리 SQL도 테스트의 트랜잭션 안에서 실행된다.
 * 정리 도중 테스트용 트랜잭션이 커밋되지 않도록, ISOLATED로 정리 SQL을 별도 트랜잭션에서 실행한다.
 * 테스트 본문에서 변경한 데이터는 테스트가 끝나면 롤백한다.
 */
@JdbcTest
@ActiveProfiles("test")
@Sql(scripts = "/cleanup.sql", config = @SqlConfig(transactionMode = SqlConfig.TransactionMode.ISOLATED))
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
public abstract class JdbcTestSupport extends MySqlContainerSupport {
}
