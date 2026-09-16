package com.yeogidam.support;

import static io.restassured.RestAssured.given;

import io.restassured.RestAssured;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.context.jdbc.SqlMergeMode;

/**
 * 컨트롤러부터 DB까지 실제 HTTP로 검증하는 E2E의 공통 지원 클래스.
 * 서버 스레드가 따로 커밋하므로 롤백 대신 cleanup.sql로 메서드마다 시나리오 데이터를 비운다.
 * 인증이 필요한 API의 E2E는 loginAsKakao로 토큰을 받고 givenBearer로 요청을 시작한다.
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

    /**
     * FakeOAuthClient가 인가 코드를 제공자 사용자 식별자로 그대로 쓰므로, 같은 코드면 같은 회원으로 로그인된다.
     */
    protected static LoginResult loginAsKakao(String authorizationCode) {
        JsonPath response = given().contentType(ContentType.JSON)
                .body("{\"authorizationCode\":\"" + authorizationCode + "\"}")
                .when().post("/api/v1/auth/logins/kakao")
                .then().statusCode(200)
                .extract().jsonPath();
        return new LoginResult(
                response.getLong("member.id"),
                response.getString("accessToken"),
                response.getString("refreshToken"));
    }

    protected static RequestSpecification givenBearer(String accessToken) {
        return given().auth().oauth2(accessToken);
    }
}
