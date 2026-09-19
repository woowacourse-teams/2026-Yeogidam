package com.yeogidam.apppolicy;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

import com.yeogidam.support.E2eTestSupport;
import io.restassured.response.ValidatableResponse;
import org.junit.jupiter.api.Test;

/**
 * 앱 업데이트 정책 조회를 실제 HTTP로 검증한다. 세 구간과 비교 규칙은 단위 테스트가 맡고,
 * 여기서는 인증 없이 열려 있는지, 응답 모양, 400 계약이 응답으로 드러나는지를 본다.
 * test 프로필의 정책은 iOS가 최소 1.2.0, 최신 1.4.0이고 Android가 최소 1.1.0, 최신 1.3.0이다.
 */
class AppUpdatePolicyE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/app-update-policies";

    @Test
    void 토큰_없이_물어봐도_정책을_돌려주고_최소_지원_버전보다_낮은_앱은_강제_업데이트다() {
        askPolicy("ios", "1.1.0")
                .statusCode(200)
                .body("updateRequired", equalTo(true))
                .body("updateRecommended", equalTo(false))
                .body("minimumSupportedVersion", equalTo("1.2.0"))
                .body("latestVersion", equalTo("1.4.0"))
                .body("storeUrl", equalTo("https://apps.apple.com/kr/app/id0000000000"));
    }

    @Test
    void 최소_지원_버전은_넘었지만_최신_버전보다_낮은_앱은_권고_업데이트다() {
        askPolicy("ios", "1.3.0")
                .statusCode(200)
                .body("updateRequired", equalTo(false))
                .body("updateRecommended", equalTo(true));
    }

    @Test
    void 최신_버전인_앱은_업데이트_안내가_없다() {
        askPolicy("android", "1.3.0")
                .statusCode(200)
                .body("updateRequired", equalTo(false))
                .body("updateRecommended", equalTo(false))
                .body("latestVersion", equalTo("1.3.0"));
    }

    @Test
    void 지원하지_않는_플랫폼이면_400_예외를_던진다() {
        askPolicy("web", "1.1.0")
                .statusCode(400)
                .body("errorCode", equalTo("APP400_001"));
    }

    @Test
    void 앱_버전이_주_부_수정_형식이_아니면_400_예외를_던진다() {
        askPolicy("ios", "1.1.0-beta")
                .statusCode(400)
                .body("errorCode", equalTo("APP400_002"));
    }

    @Test
    void 플랫폼과_앱_버전을_보내지_않으면_400_예외를_던진다() {
        given().when().get(PATH)
                .then().statusCode(400)
                .body("errorCode", equalTo("APP400_001"));
    }

    private static ValidatableResponse askPolicy(String platform, String appVersion) {
        return given().queryParam("platform", platform).queryParam("appVersion", appVersion)
                .when().get(PATH)
                .then();
    }
}
