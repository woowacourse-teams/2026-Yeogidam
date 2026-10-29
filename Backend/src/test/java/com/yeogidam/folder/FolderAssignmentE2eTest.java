package com.yeogidam.folder;

import static com.yeogidam.support.fixture.sql.FolderSavedPlaceSqlFixture.insertFolderSavedPlace;
import static com.yeogidam.support.fixture.sql.FolderSqlFixture.insertFolder;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.folder.exception.FolderErrorCode;
import com.yeogidam.global.exception.CommonErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.http.ContentType;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 폴더 담기를 실제 HTTP로 검증하되 담긴 결과는 통합 테스트에 맡기고, 상태 코드와 인가가 응답에 드러나는지만 확인한다.
 * JSON 배열에 같은 id가 두 번 오는 경우는 HTTP 요청에서만 생기므로 연결 행까지 확인한다.
 */
class FolderAssignmentE2eTest extends E2eTestSupport {

    private static final String FOLDER_ASSIGNMENTS_PATH = "/api/v1/folder-assignments";
    private static final Instant SAVED_AT = Instant.parse("2026-10-28T00:00:00Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 내_보관함_장소를_내_폴더에_담으면_204를_돌려준다() {
        // given: user-1은 보관함 장소 11과 폴더 1, 2를 가졌다.
        LoginResult login = loginAsKakao("user-1");
        insertPlace(1L);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT);
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, login.memberId(), "성수 카페", "TEAL");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("folderIds", List.of(1, 2)))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/11")
                .then().statusCode(204);
    }

    @Test
    void 같은_폴더_id가_두_번_와도_한_번만_담는다() {
        // given: user-1은 보관함 장소 11과 폴더 1을 가졌다.
        LoginResult login = loginAsKakao("user-1");
        insertPlace(1L);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT);
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");

        // when
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("folderIds", List.of(1, 1)))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/11")
                .then().statusCode(204);

        // then
        assertThat(count("folder_saved_places WHERE saved_place_id = 11 AND folder_id = 1")).isEqualTo(1);
    }

    @Test
    void 남의_보관함_장소나_남의_폴더에_담으면_404_예외를_던진다() {
        // given: user-1은 보관함 장소 11과 폴더 1을, user-2는 보관함 장소 22와 폴더 2를 가졌다.
        LoginResult login = loginAsKakao("user-1");
        LoginResult other = loginAsKakao("user-2");
        insertPlace(1L);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT);
        insertSavedPlace(jdbcTemplate, 22L, other.memberId(), 1L, SAVED_AT);
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");
        insertFolder(jdbcTemplate, 2L, other.memberId(), "남의 폴더", "PINK");

        // when & then: 남의 보관함 장소 22에 내 폴더 1을 담거나, 내 보관함 장소 11에 남의 폴더 2를 담으려 한다.
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("folderIds", List.of(1)))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/22")
                .then().statusCode(FolderErrorCode.SAVED_PLACE_OR_FOLDER_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(FolderErrorCode.SAVED_PLACE_OR_FOLDER_NOT_FOUND.getCode()))
                .body("message", equalTo(FolderErrorCode.SAVED_PLACE_OR_FOLDER_NOT_FOUND.getMessage()));
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("folderIds", List.of(2)))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/11")
                .then().statusCode(FolderErrorCode.SAVED_PLACE_OR_FOLDER_NOT_FOUND.getHttpStatus().value())
                .body("errorCode", equalTo(FolderErrorCode.SAVED_PLACE_OR_FOLDER_NOT_FOUND.getCode()))
                .body("message", equalTo(FolderErrorCode.SAVED_PLACE_OR_FOLDER_NOT_FOUND.getMessage()));
    }

    @Test
    void 폴더를_하나도_고르지_않고_저장하면_204를_돌려준다() {
        // given: user-1은 보관함 장소 11을 가졌고, 폴더 1에 담아 두었다.
        LoginResult login = loginAsKakao("user-1");
        insertPlace(1L);
        insertSavedPlace(jdbcTemplate, 11L, login.memberId(), 1L, SAVED_AT);
        insertFolder(jdbcTemplate, 1L, login.memberId(), "데이트 장소", "RED");
        insertFolderSavedPlace(jdbcTemplate, 1L, 1L, 11L);

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("folderIds", List.of()))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/11")
                .then().statusCode(204);
    }

    @Test
    void 폴더_목록을_null로_보내면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Collections.singletonMap("folderIds", null))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/11")
                .then().statusCode(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getHttpStatus().value())
                .body("errorCode", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getCode()))
                .body("message", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getMessage()));
    }

    @Test
    void 폴더_id에_null이_섞이면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("folderIds", Arrays.asList(1, null)))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/11")
                .then().statusCode(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getHttpStatus().value())
                .body("errorCode", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getCode()))
                .body("message", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getMessage()));
    }

    @Test
    void 폴더_id가_20개를_넘으면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("user-1");
        List<Long> folderIds = LongStream.rangeClosed(1, 21)
                .boxed()
                .toList();

        // when & then
        givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("folderIds", folderIds))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/11")
                .then().statusCode(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getHttpStatus().value())
                .body("errorCode", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getCode()))
                .body("message", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getMessage()));
    }

    @Test
    void 토큰_없이_폴더에_담으면_401_예외를_던진다() {
        // when & then
        given().contentType(ContentType.JSON)
                .body(Map.of("folderIds", List.of(1)))
                .when().put(FOLDER_ASSIGNMENTS_PATH + "/11")
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()))
                .body("message", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getMessage()));
    }

    private int count(String fromWhere) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + fromWhere, Integer.class);
    }

    private void insertPlace(Long placeId) {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, placeId, "kakao-" + placeId, "카페 온월",
                "서울 성동구 성수동1가 1-1", new BigDecimal("37.5445"), new BigDecimal("127.0560"));
    }
}
