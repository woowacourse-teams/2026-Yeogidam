package com.yeogidam.media.share;

import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.global.exception.ErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import com.yeogidam.support.fake.FakeExtractionRetryExecutor;
import com.yeogidam.support.fake.FakeMediaExtractionConfig;
import com.yeogidam.support.fixture.sql.MediaSqlFixture;
import com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture;
import com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture.ExtractionState;
import com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture.ReportState;
import com.yeogidam.support.fixture.sql.SharedMediaSqlFixture;
import io.restassured.response.Response;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(FakeMediaExtractionConfig.class)
class ShareReportE2eTest extends E2eTestSupport {

    private static final String REPORTS_PATH = "/api/v1/shares/{sharedMediaId}/reports";
    private static final Long MEDIA_ID = 201L;
    private static final Long SHARED_MEDIA_ID = 101L;
    private static final Long OTHER_SHARED_MEDIA_ID = 102L;
    private static final int EXTRACTION_VERSION = 1;
    private static final Instant SHARED_AT = Instant.parse("2026-10-06T00:00:00.123456Z");
    private static final Instant PREVIOUS_REPORTED_AT = SHARED_AT.plus(Duration.ofMinutes(30));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FakeExtractionRetryExecutor extractionExecutor;

    private SharedMediaReportSqlFixture fixture;

    @BeforeEach
    void setUpReport() {
        extractionExecutor.reset();
        fixture = new SharedMediaReportSqlFixture(jdbcTemplate);
    }

    @AfterEach
    void finishExtractions() throws Exception {
        extractionExecutor.awaitCompletion();
    }

    @ParameterizedTest
    @EnumSource(ExtractionFailureReason.class)
    void 본인의_실패_이력을_신고할_수_있다(ExtractionFailureReason failureReason) {
        // given
        LoginResult member = loginAsKakao("report-owner");
        createFailedHistory(member, failureReason);
        ExtractionState before = fixture.captureExtractionState();

        // when
        Instant requestStartedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Response response = report(member, SHARED_MEDIA_ID);
        Instant requestFinishedAt = Instant.now();

        // then
        assertAll(
                () -> assertCreated(response),
                () -> assertThat(fixture.reports())
                        .extracting(ReportState::sharedMediaId)
                        .containsExactly(SHARED_MEDIA_ID),
                () -> assertThat(fixture.reports())
                        .singleElement()
                        .satisfies(saved -> assertThat(saved.createdAt())
                                .isBetween(requestStartedAt, requestFinishedAt)),
                () -> assertExtractionUnchanged(before)
        );
    }

    @Test
    void 같은_미디어를_공유한_서로_다른_회원이_각자의_실패_이력을_신고할_수_있다() {
        // given
        LoginResult first = loginAsKakao("report-first-member");
        LoginResult second = loginAsKakao("report-second-member");
        createFailedHistory(first, ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        createHistory(second, OTHER_SHARED_MEDIA_ID);
        ExtractionState before = fixture.captureExtractionState();

        // when
        Response firstResponse = report(first, SHARED_MEDIA_ID);
        Response secondResponse = report(second, OTHER_SHARED_MEDIA_ID);

        // then
        assertAll(
                () -> assertCreated(firstResponse),
                () -> assertCreated(secondResponse),
                () -> assertThat(fixture.reports())
                        .extracting(ReportState::sharedMediaId)
                        .containsExactly(SHARED_MEDIA_ID, OTHER_SHARED_MEDIA_ID),
                () -> assertExtractionUnchanged(before)
        );
    }

    @Test
    void 토큰_없이_신고하면_401_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("report-owner");
        createFailedHistory(member, ExtractionFailureReason.UNEXPECTED);
        ExtractionState before = fixture.captureExtractionState();

        // when
        Response response = given()
                .when()
                .post(REPORTS_PATH, SHARED_MEDIA_ID);

        // then
        assertRejected(response, AuthErrorCode.AUTHENTICATION_REQUIRED, before, List.of());
    }

    @ParameterizedTest
    @ValueSource(longs = {102L, 999L})
    void 존재하지_않거나_다른_회원의_이력을_신고하면_404_예외를_던진다(Long sharedMediaId) {
        // given
        LoginResult member = loginAsKakao("report-owner");
        LoginResult other = loginAsKakao("report-other-member");
        createFailedHistory(member, ExtractionFailureReason.UNEXPECTED);
        createHistory(other, OTHER_SHARED_MEDIA_ID);
        ExtractionState before = fixture.captureExtractionState();

        // when
        Response response = report(member, sharedMediaId);

        // then
        assertRejected(response, MediaErrorCode.SHARED_MEDIA_NOT_FOUND, before, List.of());
    }

    @ParameterizedTest
    @EnumSource(value = ExtractionStatus.class, names = {"EXTRACTING", "SUCCEEDED"})
    void 실패하지_않은_이력을_신고하면_400_예외를_던진다(ExtractionStatus status) {
        // given
        LoginResult member = loginAsKakao("report-owner");
        MediaSqlFixture.insertMedia(jdbcTemplate, MEDIA_ID, EXTRACTION_VERSION, status);
        createHistory(member, SHARED_MEDIA_ID);
        ExtractionState before = fixture.captureExtractionState();

        // when
        Response response = report(member, SHARED_MEDIA_ID);

        // then
        assertRejected(response, MediaErrorCode.REPORT_ON_NON_FAILED, before, List.of());
    }

    @Test
    void 이미_신고한_이력을_다시_신고하면_409_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("report-owner");
        createFailedHistory(member, ExtractionFailureReason.UNEXPECTED);
        fixture.insertReport(SHARED_MEDIA_ID, PREVIOUS_REPORTED_AT);
        List<ReportState> reportsBefore = fixture.reports();
        ExtractionState before = fixture.captureExtractionState();

        // when
        Response response = report(member, SHARED_MEDIA_ID);

        // then
        assertRejected(response, MediaErrorCode.ALREADY_REPORTED, before, reportsBefore);
    }

    private void createFailedHistory(LoginResult member, ExtractionFailureReason failureReason) {
        MediaSqlFixture.insertFailedMedia(jdbcTemplate, MEDIA_ID, EXTRACTION_VERSION, failureReason);
        createHistory(member, SHARED_MEDIA_ID);
    }

    private void createHistory(LoginResult member, Long sharedMediaId) {
        SharedMediaSqlFixture.insertSharedMedia(jdbcTemplate, sharedMediaId, member.memberId(), MEDIA_ID, SHARED_AT);
    }

    private Response report(LoginResult member, Long sharedMediaId) {
        return givenBearer(member.accessToken())
                .when()
                .post(REPORTS_PATH, sharedMediaId);
    }

    private void assertCreated(Response response) {
        response.then()
                .statusCode(HttpStatus.CREATED.value())
                .body(emptyString());
    }

    private void assertRejected(
            Response response,
            ErrorCode errorCode,
            ExtractionState before,
            List<ReportState> reportsBefore
    ) {
        assertAll(
                () -> response.then()
                        .statusCode(errorCode.getHttpStatus().value())
                        .body("errorCode", equalTo(errorCode.getCode()))
                        .body("message", equalTo(errorCode.getMessage())),
                () -> assertThat(fixture.reports())
                        .isEqualTo(reportsBefore),
                () -> assertExtractionUnchanged(before)
        );
    }

    private void assertExtractionUnchanged(ExtractionState before) {
        assertAll(
                () -> assertThat(fixture.captureExtractionState())
                        .isEqualTo(before),
                () -> assertThat(extractionExecutor.countSubmittedTasks())
                        .isZero()
        );
    }

    @TestConfiguration
    static class ReportTestConfiguration {

        @Primary
        @Bean(destroyMethod = "close")
        FakeExtractionRetryExecutor fakeExtractionRetryExecutor() {
            return new FakeExtractionRetryExecutor();
        }
    }
}
