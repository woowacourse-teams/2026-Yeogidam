package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertFailedMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.sharedUrl;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.global.exception.CommonErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.extraction.config.ExtractionProperties;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.service.MediaExtractionPipeline;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(ShareCreationE2eTest.FakeMetadataServiceConfiguration.class)
class ShareCreationE2eTest extends E2eTestSupport {

    private static final String PATH = "/api/v1/shares";
    private static final String REEL_URL = "https://www.instagram.com/reel/DtfsHfzzmdc/";
    private static final String CARESEL_URL = "https://www.instagram.com/p/Kpvneizvdyo/";
    private static final Long MEDIA_ID = 1L;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ExtractionProperties extractionProperties;

    @TestConfiguration
    static class FakeMetadataServiceConfiguration {

        @Bean
        @Primary
        MediaExtractionPipeline fakeMediaExtractionPipeline() {
            return new MediaExtractionPipeline(null, null, null, null, null) {
                @Override
                public void extract(Long mediaId, InstagramUrl instagramUrl) {
                }
            };
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {REEL_URL, CARESEL_URL})
    void 공유한_미디어의_장소_추출_요청을_접수한다(String instagramUrl) {
        // given
        LoginResult login = loginAsKakao("share-creation-user");

        // when
        JsonPath response = givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + instagramUrl + "\"}")
                .when().post(PATH)
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().jsonPath();

        // then
        // TODO: 비동기 작업 시작했는지 검증 추가?
        assertThat(response.getString("extractionStatus")).isEqualTo(ExtractionStatus.EXTRACTING.name());
        assertThat(readSharedMediaIds(login.memberId())).containsExactly(response.getLong("sharedMediaId"));
        assertThat(countMedia(instagramUrl)).isEqualTo(1);
        assertThat(extractionStatus(instagramUrl)).isEqualTo(ExtractionStatus.EXTRACTING.name());
        assertThat(countSharedMedia(login.memberId(), instagramUrl)).isEqualTo(1);
    }

    @Test
    void 분석_중인_미디어를_공유하면_기존_미디어를_재사용한다() {
        // given
        LoginResult login = loginAsKakao("share-creation-user");
        createMediaUnderAnalysis(REEL_URL);

        // when
        JsonPath response = givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + REEL_URL + "\"}")
                .when().post(PATH)
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().jsonPath();

        // then
        assertThat(response.getString("extractionStatus")).isEqualTo(ExtractionStatus.EXTRACTING.name());
        assertThat(readSharedMediaIds(login.memberId())).containsExactly(response.getLong("sharedMediaId"));
        assertThat(countMedia(REEL_URL)).isEqualTo(1);
        assertThat(extractionStatus(REEL_URL)).isEqualTo(ExtractionStatus.EXTRACTING.name());
        assertThat(countSharedMedia(login.memberId(), REEL_URL)).isEqualTo(1);
    }

    @Test
    void 같은_미디어를_다시_공유해도_장소_추출_요청이_접수된다() {
        // given
        LoginResult login = loginAsKakao("share-creation-user");

        // when
        JsonPath firstResponse = givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + REEL_URL + "\"}")
                .when().post(PATH)
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().jsonPath();
        JsonPath secondResponse = givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + REEL_URL + "\"}")
                .when().post(PATH)
                .then().statusCode(HttpStatus.ACCEPTED.value())
                .extract().jsonPath();

        // then
        assertThat(firstResponse.getString("extractionStatus")).isEqualTo(ExtractionStatus.EXTRACTING.name());
        assertThat(secondResponse.getString("extractionStatus")).isEqualTo(ExtractionStatus.EXTRACTING.name());
        assertThat(readSharedMediaIds(login.memberId()))
                .containsExactly(firstResponse.getLong("sharedMediaId"), secondResponse.getLong("sharedMediaId"));
        assertThat(countMedia(REEL_URL)).isEqualTo(1);
        assertThat(extractionStatus(REEL_URL)).isEqualTo(ExtractionStatus.EXTRACTING.name());
        assertThat(countSharedMedia(login.memberId(), REEL_URL)).isEqualTo(2);
    }

    @Test
    void 이미_분석에_성공한_미디어를_공유하면_장소를_바로_보관함에_저장하고_SUCCEEDED를_돌려준다() {
        // given
        LoginResult login = loginAsKakao("share-creation-user");
        insertMedia(jdbcTemplate, MEDIA_ID, extractionProperties.pipelineVersion(), ExtractionStatus.SUCCEEDED);
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 101L, "kakao-101", "올드빅",
                "서울 성동구 성수동2가 1-1", new BigDecimal("37.5446"), new BigDecimal("127.0559"));
        insertMediaPlace(jdbcTemplate, 1L, MEDIA_ID, 101L);

        // when
        Response response = share(login, sharedUrl(MEDIA_ID));

        // then
        Long sharedMediaId = response.then()
                .statusCode(HttpStatus.ACCEPTED.value())
                .body("extractionStatus", equalTo(ExtractionStatus.SUCCEEDED.name()))
                .extract()
                .jsonPath()
                .getLong("sharedMediaId");
        assertAll(
                () -> assertThat(readSharedMediaIds(login.memberId())).containsExactly(sharedMediaId),
                () -> assertThat(readSavedPlaceIds(login.memberId())).containsExactly(101L),
                () -> assertThat(countShareLinks(sharedMediaId)).isEqualTo(1)
        );
    }

    @Test
    void 재시도_조건에_맞지_않는_실패_미디어를_공유하면_다시_분석하지_않고_FAILED를_돌려준다() {
        // given
        LoginResult login = loginAsKakao("share-creation-user");
        insertFailedMedia(jdbcTemplate, MEDIA_ID, extractionProperties.pipelineVersion(),
                ExtractionFailureReason.PLACE_NOT_EXTRACTED);

        // when
        Response response = share(login, sharedUrl(MEDIA_ID));

        // then
        Long sharedMediaId = response.then()
                .statusCode(HttpStatus.ACCEPTED.value())
                .body("extractionStatus", equalTo(ExtractionStatus.FAILED.name()))
                .extract()
                .jsonPath()
                .getLong("sharedMediaId");
        assertAll(
                () -> assertThat(readSharedMediaIds(login.memberId())).containsExactly(sharedMediaId),
                () -> assertThat(extractionStatus(sharedUrl(MEDIA_ID))).isEqualTo(ExtractionStatus.FAILED.name())
        );
    }

    @Test
    void 지원하지_않는_링크로_공유하면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("share-creation-user");

        // when & then
        givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"https://www.instagram.com/pp/DdwOHfzzmdc/\"}")
                .when().post(PATH)
                .then().statusCode(MediaErrorCode.UNSUPPORTED_LINK.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.UNSUPPORTED_LINK.getCode()))
                .body("message", equalTo(MediaErrorCode.UNSUPPORTED_LINK.getMessage()));
        assertThat(countMediaRows()).isZero();
        assertThat(countSharedMediaRows()).isZero();
    }

    @Test
    void 형식이_잘못된_링크로_공유하면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("share-creation-user");

        // when & then
        givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"https://www.instagram.com/reel/ ABC /\"}")
                .when().post(PATH)
                .then().statusCode(MediaErrorCode.INVALID_LINK.getHttpStatus().value())
                .body("errorCode", equalTo(MediaErrorCode.INVALID_LINK.getCode()))
                .body("message", equalTo(MediaErrorCode.INVALID_LINK.getMessage()));
        assertThat(countMediaRows()).isZero();
        assertThat(countSharedMediaRows()).isZero();
    }

    @Test
    void 인스타그램_URL이_공백이면_400_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("share-creation-user");

        // when & then
        givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\" \"}")
                .when().post(PATH)
                .then().statusCode(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getHttpStatus().value())
                .body("errorCode", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getCode()))
                .body("message", equalTo(CommonErrorCode.METHOD_ARGUMENT_NOT_VALID.getMessage()));
        assertThat(countMediaRows()).isZero();
        assertThat(countSharedMediaRows()).isZero();
    }

    @Test
    void 토큰_없이_공유하면_401_예외를_던진다() {
        // when & then
        given()
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + REEL_URL + "\"}")
                .when().post(PATH)
                .then().statusCode(AuthErrorCode.AUTHENTICATION_REQUIRED.getHttpStatus().value())
                .body("errorCode", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getCode()))
                .body("message", equalTo(AuthErrorCode.AUTHENTICATION_REQUIRED.getMessage()));
        assertThat(countMediaRows()).isZero();
        assertThat(countSharedMediaRows()).isZero();
    }

    private int countMedia(String instagramUrl) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM media
                WHERE media_shortcode = ?
                """, Integer.class, new InstagramUrl(instagramUrl).getMediaShortcode().value());
    }

    private String extractionStatus(String instagramUrl) {
        return jdbcTemplate.queryForObject("""
                SELECT extraction_status
                FROM media
                WHERE media_shortcode = ?
                """, String.class, new InstagramUrl(instagramUrl).getMediaShortcode().value());
    }

    private int countSharedMedia(Long memberId, String instagramUrl) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM shared_media sm
                JOIN media m ON m.id = sm.media_id
                WHERE sm.member_id = ?
                  AND m.media_shortcode = ?
                """, Integer.class, memberId, new InstagramUrl(instagramUrl).getMediaShortcode().value());
    }

    private int countMediaRows() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM media", Integer.class);
    }

    private int countSharedMediaRows() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM shared_media", Integer.class);
    }

    private void createMediaUnderAnalysis(String instagramUrl) {
        int EXTRACTION_VERSION = 1;
        jdbcTemplate.update("""
                        INSERT INTO media (
                            media_shortcode, extraction_status, extraction_version, source_type
                        )
                        VALUES (?, 'EXTRACTING', ?, 'EXTRACTED')
                        """, new InstagramUrl(instagramUrl).getMediaShortcode().value(),
                EXTRACTION_VERSION);
    }

    private Response share(LoginResult login, String instagramUrl) {
        return givenBearer(login.accessToken())
                .contentType("application/json")
                .body("{\"instagramUrl\":\"" + instagramUrl + "\"}")
                .when()
                .post(PATH);
    }

    private List<Long> readSharedMediaIds(Long memberId) {
        return jdbcTemplate.queryForList("""
                SELECT id
                FROM shared_media
                WHERE member_id = ?
                ORDER BY id
                """, Long.class, memberId);
    }

    private List<Long> readSavedPlaceIds(Long memberId) {
        return jdbcTemplate.queryForList("""
                SELECT place_id
                FROM saved_places
                WHERE member_id = ?
                ORDER BY id
                """, Long.class, memberId);
    }

    private int countShareLinks(Long sharedMediaId) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM shared_media_saved_places WHERE shared_media_id = ?
                """, Integer.class, sharedMediaId);
    }
}
