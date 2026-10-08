package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.global.exception.CommonErrorCode;
import com.yeogidam.global.exception.ErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 온보딩 때 보관함에 담은 장소를 가입한 회원의 보관함으로 옮기는 흐름을 공개 API로 검증한다.
 * 온보딩 릴스는 test 프로필의 onboarding.instagram-url에 적힌 미디어 17번이다.
 */
class OnboardingE2eTest extends E2eTestSupport {

    private static final String ONBOARDING_PATH = "/api/v1/onboarding/saved-places";
    private static final String ONBOARDING_URL = "https://www.instagram.com/p/fixture-media-17/";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 남긴_장소만_보관함으로_옮기고_온보딩_릴스의_공유_이력을_만든다() {
        // given
        LoginResult member = loginAsKakao("onboarding-member");
        insertOnboardingMedia();

        // when
        Response response = transfer(member, List.of("26338954", "987654321", "1122334455"));

        // then
        Long sharedMediaId = response.then()
                .statusCode(HttpStatus.CREATED.value())
                .extract()
                .jsonPath()
                .getLong("sharedMediaId");
        assertAll(
                () -> assertThat(readShares(member)).containsExactly(
                        new ShareState(sharedMediaId, 17L, ONBOARDING_URL, ExtractionStatus.SUCCEEDED.name())),
                () -> assertThat(readSavedPlaceIds(member)).containsExactly(101L, 103L, 105L),
                () -> assertThat(countShareLinks(sharedMediaId)).isEqualTo(3)
        );
    }

    @Test
    void 장소를_모두_지운_회원은_공유_이력만_만든다() {
        // given
        LoginResult member = loginAsKakao("onboarding-empty-member");
        insertOnboardingMedia();

        // when
        Response response = transfer(member, List.of());

        // then
        Long sharedMediaId = response.then()
                .statusCode(HttpStatus.CREATED.value())
                .extract()
                .jsonPath()
                .getLong("sharedMediaId");
        assertAll(
                () -> assertThat(readShares(member)).containsExactly(
                        new ShareState(sharedMediaId, 17L, ONBOARDING_URL, ExtractionStatus.SUCCEEDED.name())),
                () -> assertThat(readSavedPlaceIds(member)).isEmpty(),
                () -> assertThat(countShareLinks(sharedMediaId)).isZero()
        );
    }

    @Test
    void 이미_옮긴_회원이_다시_부르면_같은_이력을_돌려주고_아무것도_바꾸지_않는다() {
        // given
        LoginResult member = loginAsKakao("onboarding-again-member");
        insertOnboardingMedia();
        Long firstShareId = transfer(member, List.of("26338954", "987654321"))
                .jsonPath()
                .getLong("sharedMediaId");
        OnboardingDataSnapshot before = readOnboardingData();

        // when
        Response response = transfer(member, List.of("1122334455"));

        // then
        assertAll(
                () -> response.then()
                        .statusCode(HttpStatus.CREATED.value())
                        .body("sharedMediaId", equalTo(firstShareId.intValue())),
                () -> assertThat(readOnboardingData()).isEqualTo(before)
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"000000", ""})
    void 온보딩_릴스에서_추출되지_않은_장소가_섞이면_400_예외를_던진다(String kakaoPlaceId) {
        // given
        LoginResult member = loginAsKakao("onboarding-wrong-place-member");
        insertOnboardingMedia();
        OnboardingDataSnapshot before = readOnboardingData();

        // when
        Response response = transfer(member, List.of("26338954", kakaoPlaceId));

        // then
        assertRejected(response, PlaceErrorCode.NOT_ONBOARDING_PLACE, before);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"kakaoPlaceIds\": null}"})
    void kakaoPlaceIds가_없으면_400_예외를_던진다(String body) {
        // given
        LoginResult member = loginAsKakao("onboarding-invalid-body-member");
        insertOnboardingMedia();
        OnboardingDataSnapshot before = readOnboardingData();

        // when
        Response response = givenBearer(member.accessToken())
                .contentType(ContentType.JSON)
                .body(body)
                .when()
                .post(ONBOARDING_PATH);

        // then
        assertRejected(response, CommonErrorCode.METHOD_ARGUMENT_NOT_VALID, before);
    }

    @Test
    void 온보딩_릴스가_시드_데이터에_없으면_503_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("onboarding-not-prepared-member");
        OnboardingDataSnapshot before = readOnboardingData();

        // when
        Response response = transfer(member, List.of("26338954"));

        // then
        assertRejected(response, MediaErrorCode.ONBOARDING_MEDIA_NOT_PREPARED, before);
    }

    @Test
    void 토큰_없이_부르면_401_예외를_던진다() {
        // given
        insertOnboardingMedia();
        OnboardingDataSnapshot before = readOnboardingData();

        // when
        Response response = given()
                .contentType(ContentType.JSON)
                .body(Map.of("kakaoPlaceIds", List.of("26338954")))
                .when()
                .post(ONBOARDING_PATH);

        // then
        assertRejected(response, AuthErrorCode.AUTHENTICATION_REQUIRED, before);
    }

    private void insertOnboardingMedia() {
        insertMedia(jdbcTemplate, 17L, "군자역 디저트 맛집 5곳", "onboarding.jpg", "@gunja_dessert");
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 101L, "26338954", "디저트 가게 1",
                "서울 광진구 화양동 1-1", new BigDecimal("37.5571"), new BigDecimal("127.0794"));
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 102L, "1234567890", "디저트 가게 2",
                "서울 광진구 화양동 1-2", new BigDecimal("37.5572"), new BigDecimal("127.0795"));
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 103L, "987654321", "디저트 가게 3",
                "서울 광진구 화양동 1-3", new BigDecimal("37.5573"), new BigDecimal("127.0796"));
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 104L, "5566778899", "디저트 가게 4",
                "서울 광진구 화양동 1-4", new BigDecimal("37.5574"), new BigDecimal("127.0797"));
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 105L, "1122334455", "디저트 가게 5",
                "서울 광진구 화양동 1-5", new BigDecimal("37.5575"), new BigDecimal("127.0798"));
        for (long placeId = 101L; placeId <= 105L; placeId++) {
            insertMediaPlace(jdbcTemplate, placeId, 17L, placeId);
        }
    }

    private Response transfer(LoginResult member, List<String> kakaoPlaceIds) {
        return givenBearer(member.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("kakaoPlaceIds", kakaoPlaceIds))
                .when()
                .post(ONBOARDING_PATH);
    }

    private void assertRejected(Response response, ErrorCode errorCode, OnboardingDataSnapshot before) {
        assertAll(
                () -> response.then()
                        .statusCode(errorCode.getHttpStatus().value())
                        .body("errorCode", equalTo(errorCode.getCode()))
                        .body("message", equalTo(errorCode.getMessage())),
                () -> assertThat(readOnboardingData()).isEqualTo(before)
        );
    }

    private List<ShareState> readShares(LoginResult member) {
        return jdbcTemplate.query("""
                SELECT id, media_id, shared_url, extraction_status
                FROM shared_media
                WHERE member_id = ?
                ORDER BY id
                """, (resultSet, rowNumber) -> new ShareState(
                resultSet.getLong("id"),
                resultSet.getLong("media_id"),
                resultSet.getString("shared_url"),
                resultSet.getString("extraction_status")
        ), member.memberId());
    }

    private List<Long> readSavedPlaceIds(LoginResult member) {
        return jdbcTemplate.queryForList("""
                SELECT place_id
                FROM saved_places
                WHERE member_id = ?
                ORDER BY id
                """, Long.class, member.memberId());
    }

    private int countShareLinks(Long sharedMediaId) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM shared_media_saved_places WHERE shared_media_id = ?
                """, Integer.class, sharedMediaId);
    }

    private OnboardingDataSnapshot readOnboardingData() {
        return new OnboardingDataSnapshot(
                jdbcTemplate.queryForList("SELECT * FROM shared_media ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM saved_places ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM shared_media_saved_places ORDER BY id")
        );
    }

    private record ShareState(Long sharedMediaId, Long mediaId, String sharedUrl, String extractionStatus) {
    }

    private record OnboardingDataSnapshot(
            List<Map<String, Object>> sharedMedia,
            List<Map<String, Object>> savedPlaces,
            List<Map<String, Object>> shareLinks
    ) {
    }
}
