package com.yeogidam;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import com.yeogidam.support.E2eTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/**
 * 배포 헬스체크가 쓰는 액추에이터 설정을 고정한다. Dockerfile의 HEALTHCHECK와 배포 스크립트가 liveness만 본다.
 * 세부를 감추는 설정이라 readiness는 열려 있으면 안 된다.
 * 별도 컨텍스트를 띄우지 않도록 E2E 컨텍스트에서 실제 HTTP로 확인한다.
 */
class LivenessEndpointTest extends E2eTestSupport {

    @Test
    void 기동하면_liveness가_UP을_돌려준다() {
        // when & then
        given().when().get("/actuator/health/liveness")
                .then().statusCode(HttpStatus.OK.value())
                .body("status", equalTo("UP"));
    }

    @Test
    void readiness는_열지_않는다() {
        // when & then
        given().when().get("/actuator/health/readiness")
                .then().statusCode(HttpStatus.NOT_FOUND.value());
    }
}
