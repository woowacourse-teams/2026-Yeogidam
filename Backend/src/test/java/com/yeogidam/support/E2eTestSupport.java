package com.yeogidam.support;

import io.restassured.RestAssured;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.context.jdbc.SqlMergeMode;

/**
 * 컨트롤러부터 DB까지 실제 HTTP로 검증하는 E2E의 공통 바닥.
 * 서버 스레드가 따로 커밋하므로 롤백 대신 cleanup.sql로 메서드마다 시나리오 데이터를 비운다.
 */
@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(FakeOAuthClientConfig.class)
@Sql(scripts = "/cleanup.sql", executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@SqlMergeMode(SqlMergeMode.MergeMode.MERGE)
public abstract class E2eTestSupport extends MySqlContainerSupport {

    @LocalServerPort
    private int port;

    @BeforeEach
    void setUpRestAssuredPort() {
        RestAssured.port = port;
    }
}
