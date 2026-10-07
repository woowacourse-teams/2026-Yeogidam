package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertFailedMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaReportSqlFixture.insertReport;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
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
import io.restassured.response.Response;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
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

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FakeExtractionRetryExecutor extractionExecutor;

    @BeforeEach
    void setUpReport() {
        extractionExecutor.reset();
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
        insertFailedHistory(member.memberId(), 101L, failureReason);
        ExtractionSnapshot before = readExtractionSnapshot();

        // when
        Instant requestStartedAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Response response = report(member, 101L);
        Instant requestFinishedAt = Instant.now();

        // then
        assertAll(
                () -> assertCreated(response),
                () -> assertThat(readReports())
                        .extracting(ReportState::sharedMediaId)
                        .containsExactly(101L),
                () -> assertThat(readReports())
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
        insertFailedHistory(first.memberId(), 101L, ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        insertHistory(second.memberId(), 102L);
        ExtractionSnapshot before = readExtractionSnapshot();

        // when
        Response firstResponse = report(first, 101L);
        Response secondResponse = report(second, 102L);

        // then
        assertAll(
                () -> assertCreated(firstResponse),
                () -> assertCreated(secondResponse),
                () -> assertThat(readReports())
                        .extracting(ReportState::sharedMediaId)
                        .containsExactly(101L, 102L),
                () -> assertExtractionUnchanged(before)
        );
    }

    @Test
    void 토큰_없이_신고하면_401_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("report-owner");
        insertFailedHistory(member.memberId(), 101L, ExtractionFailureReason.UNEXPECTED);
        ExtractionSnapshot before = readExtractionSnapshot();

        // when
        Response response = given()
                .when()
                .post(REPORTS_PATH, 101L);

        // then
        assertRejected(response, AuthErrorCode.AUTHENTICATION_REQUIRED, before, List.of());
    }

    @ParameterizedTest
    @ValueSource(longs = {102L, 999L})
    void 존재하지_않거나_다른_회원의_이력을_신고하면_404_예외를_던진다(Long sharedMediaId) {
        // given
        LoginResult member = loginAsKakao("report-owner");
        LoginResult other = loginAsKakao("report-other-member");
        insertFailedHistory(member.memberId(), 101L, ExtractionFailureReason.UNEXPECTED);
        insertHistory(other.memberId(), 102L);
        ExtractionSnapshot before = readExtractionSnapshot();

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
        insertMedia(jdbcTemplate, 201L, 1, status);
        insertHistory(member.memberId(), 101L);
        ExtractionSnapshot before = readExtractionSnapshot();

        // when
        Response response = report(member, 101L);

        // then
        assertRejected(response, MediaErrorCode.REPORT_ON_NON_FAILED, before, List.of());
    }

    @Test
    void 이미_신고한_이력을_다시_신고하면_409_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("report-owner");
        insertFailedHistory(member.memberId(), 101L, ExtractionFailureReason.UNEXPECTED);
        insertReport(jdbcTemplate, 1L, 101L, Instant.parse("2026-10-06T00:30:00.123456Z"));
        List<ReportState> reportsBefore = readReports();
        ExtractionSnapshot before = readExtractionSnapshot();

        // when
        Response response = report(member, 101L);

        // then
        assertRejected(response, MediaErrorCode.ALREADY_REPORTED, before, reportsBefore);
    }

    private void insertFailedHistory(Long memberId, Long sharedMediaId, ExtractionFailureReason failureReason) {
        insertFailedMedia(jdbcTemplate, 201L, 1, failureReason);
        insertHistory(memberId, sharedMediaId);
    }

    private void insertHistory(Long memberId, Long sharedMediaId) {
        insertSharedMedia(jdbcTemplate, sharedMediaId, memberId, 201L, Instant.parse("2026-10-06T00:00:00.123456Z"));
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
            ExtractionSnapshot before,
            List<ReportState> reportsBefore
    ) {
        assertAll(
                () -> response.then()
                        .statusCode(errorCode.getHttpStatus().value())
                        .body("errorCode", equalTo(errorCode.getCode()))
                        .body("message", equalTo(errorCode.getMessage())),
                () -> assertThat(readReports())
                        .isEqualTo(reportsBefore),
                () -> assertExtractionUnchanged(before)
        );
    }

    private void assertExtractionUnchanged(ExtractionSnapshot before) {
        assertAll(
                () -> assertThat(readExtractionSnapshot())
                        .isEqualTo(before),
                () -> assertThat(extractionExecutor.countSubmittedTasks())
                        .isZero()
        );
    }

    private List<ReportState> readReports() {
        return jdbcTemplate.query("""
                SELECT id, shared_media_id, created_at
                FROM shared_media_reports
                ORDER BY shared_media_id
                """, (resultSet, rowNumber) -> new ReportState(
                resultSet.getLong("id"),
                resultSet.getLong("shared_media_id"),
                resultSet.getTimestamp("created_at").toInstant()
        ));
    }

    private ExtractionSnapshot readExtractionSnapshot() {
        return new ExtractionSnapshot(
                jdbcTemplate.queryForList("SELECT * FROM media ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM shared_media ORDER BY id")
        );
    }

    private record ReportState(Long id, Long sharedMediaId, Instant createdAt) {
    }

    private record ExtractionSnapshot(List<Map<String, Object>> media, List<Map<String, Object>> sharedMedia) {
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
