package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.PlaceFixture.place;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertFailedMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.sharedUrl;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.global.exception.ErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import com.yeogidam.support.fake.FakeExtractionRetryExecutor;
import com.yeogidam.support.fake.FakeMediaExtractionConfig;
import com.yeogidam.support.fake.FakePlaceNameExtractor;
import com.yeogidam.support.fake.FakePlaceSearcher;
import io.restassured.http.ContentType;
import io.restassured.path.json.JsonPath;
import io.restassured.response.Response;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

/**
 * 새 히스토리 접수, 요청 권한, 과거 실패 보존과 분석 합류를 공개 API로 검증한다.
 */
@Import(FakeMediaExtractionConfig.class)
@TestPropertySource(properties = "media.extraction.pipeline-version=2")
class ExtractionRetryE2eTest extends E2eTestSupport {

    private static final String SHARES_PATH = "/api/v1/shares";
    private static final Long MEDIA_ID = 3L;
    private static final Long ORIGINAL_SHARE_ID = 10L;
    private static final Long OTHER_SHARE_ID = 20L;
    private static final int CURRENT_VERSION = 2;
    private static final int PREVIOUS_VERSION = 1;
    private static final Instant ORIGINAL_SHARED_AT = Instant.parse("2026-10-05T01:00:00.123456Z");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FakePlaceNameExtractor placeNameExtractor;

    @Autowired
    private FakePlaceSearcher placeSearcher;

    @Autowired
    private FakeExtractionRetryExecutor extractionExecutor;

    @BeforeEach
    void setUpRetry() {
        placeNameExtractor.reset();
        placeNameExtractor.block();
        placeSearcher.reset();
        placeSearcher.add("올드빅", place(301L));
        extractionExecutor.reset();
    }

    @AfterEach
    void finishExtractions() throws Exception {
        completeExtraction();
    }

    @Test
    void 재시도하면_새_히스토리를_만들고_기존_실패_이력은_유지한다() {
        // given
        LoginResult member = loginAsKakao("retry-new-history");
        createFailedHistory(member, ORIGINAL_SHARE_ID, ExtractionFailureReason.UNEXPECTED);

        // when
        Instant requestStartedAt = readDatabaseTime();
        Long retriedShareId = requestRetry(member, ORIGINAL_SHARE_ID);
        Instant requestFinishedAt = readDatabaseTime();

        // then
        JsonPath history = readHistory(member, retriedShareId);
        Map<String, Object> source = jdbcTemplate.queryForMap("""
                SELECT member_id, media_id, shared_url
                FROM shared_media
                WHERE id = ?
                """, retriedShareId);
        assertAll(
                () -> assertThat(retriedShareId).isNotEqualTo(ORIGINAL_SHARE_ID),
                () -> assertThat(history.getLong("sharedMediaId")).isEqualTo(retriedShareId),
                () -> assertThat(history.getString("extractionStatus")).isEqualTo(ExtractionStatus.EXTRACTING.name()),
                () -> assertThat(history.getString("failureReason")).isNull(),
                () -> assertThat(Instant.parse(history.getString("createdAt"))).isBetween(requestStartedAt, requestFinishedAt),
                () -> assertThat(source)
                        .containsEntry("member_id", member.memberId())
                        .containsEntry("media_id", MEDIA_ID)
                        .containsEntry("shared_url", sharedUrl(MEDIA_ID)),
                () -> assertFailedHistory(member, ORIGINAL_SHARE_ID),
                () -> assertThat(readHistoryIds(member)).containsExactly(retriedShareId, ORIGINAL_SHARE_ID),
                () -> assertThat(extractionExecutor.countSubmittedTasks()).isEqualTo(1)
        );
    }

    @Test
    void 재시도한_분석이_실패하면_새_이력에_실패_사유를_기록하고_옛_이력은_유지한다() throws Exception {
        // given
        LoginResult member = loginAsKakao("retry-failed-again");
        insertFailedMedia(jdbcTemplate, MEDIA_ID, PREVIOUS_VERSION, ExtractionFailureReason.UNEXPECTED);
        insertSharedMedia(jdbcTemplate, ORIGINAL_SHARE_ID, member.memberId(), MEDIA_ID,
                sharedUrl(MEDIA_ID), ORIGINAL_SHARED_AT);
        Map<String, Object> originalHistory = jdbcTemplate.queryForMap(
                "SELECT * FROM shared_media WHERE id = ?", ORIGINAL_SHARE_ID);
        placeNameExtractor.failWith(new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED));

        // when
        Long retriedShareId = requestRetry(member, ORIGINAL_SHARE_ID);
        assertThat(placeNameExtractor.awaitStarted()).isTrue();
        completeExtraction();

        // then
        JsonPath history = readHistory(member, retriedShareId);
        assertAll(
                () -> assertThat(history.getString("extractionStatus"))
                        .isEqualTo(ExtractionStatus.FAILED.name()),
                () -> assertThat(history.getString("failureReason"))
                        .isEqualTo(ExtractionFailureReason.PROCESSING_FAILED.name()),
                () -> assertThat(jdbcTemplate.queryForObject(
                        "SELECT extraction_version FROM shared_media WHERE id = ?", Integer.class, retriedShareId))
                        .isEqualTo(CURRENT_VERSION),
                () -> assertThat(jdbcTemplate.queryForMap(
                        "SELECT * FROM shared_media WHERE id = ?", ORIGINAL_SHARE_ID))
                        .isEqualTo(originalHistory),
                () -> assertFailedHistory(member, ORIGINAL_SHARE_ID),
                () -> assertThat(readHistoryIds(member)).containsExactly(retriedShareId, ORIGINAL_SHARE_ID),
                () -> assertThat(readSavedPlaceIds(member)).isEmpty(),
                () -> assertThat(extractionExecutor.countSubmittedTasks()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1)
        );
    }

    @Test
    void 토큰_없이_재시도하면_401_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("retry-without-token");
        createFailedHistory(member, ORIGINAL_SHARE_ID, ExtractionFailureReason.UNEXPECTED);
        RetryDataSnapshot previous = readRetryData();

        // when
        Response response = given()
                .when()
                .post(retryPath(ORIGINAL_SHARE_ID));

        // then
        assertRejected(response, AuthErrorCode.AUTHENTICATION_REQUIRED, previous);
    }

    @Test
    void 존재하지_않는_히스토리를_재시도하면_404_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("retry-missing-history");
        RetryDataSnapshot previous = readRetryData();

        // when
        Response response = sendRetry(member, ORIGINAL_SHARE_ID);

        // then
        assertRejected(response, MediaErrorCode.SHARED_MEDIA_NOT_FOUND, previous);
    }

    @Test
    void 다른_회원의_히스토리를_재시도하면_404_예외를_던진다() {
        // given
        LoginResult owner = loginAsKakao("retry-owner");
        LoginResult other = loginAsKakao("retry-not-owner");
        createFailedHistory(owner, ORIGINAL_SHARE_ID, ExtractionFailureReason.UNEXPECTED);
        RetryDataSnapshot previous = readRetryData();

        // when
        Response response = sendRetry(other, ORIGINAL_SHARE_ID);

        // then
        assertRejected(response, MediaErrorCode.SHARED_MEDIA_NOT_FOUND, previous);
    }

    @Test
    void 성공한_히스토리를_재시도하면_400_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("retry-succeeded-history");
        createHistory(member, ExtractionStatus.SUCCEEDED);
        RetryDataSnapshot previous = readRetryData();

        // when
        Response response = sendRetry(member, ORIGINAL_SHARE_ID);

        // then
        assertRejected(response, MediaErrorCode.RETRY_ON_SUCCEEDED, previous);
    }

    @Test
    void 분석_중인_히스토리를_재시도하면_400_예외를_던진다() {
        // given
        LoginResult member = loginAsKakao("retry-extracting-history");
        createHistory(member, ExtractionStatus.EXTRACTING);
        RetryDataSnapshot previous = readRetryData();

        // when
        Response response = sendRetry(member, ORIGINAL_SHARE_ID);

        // then
        assertRejected(response, MediaErrorCode.RETRY_WHILE_EXTRACTING, previous);
    }

    @ParameterizedTest
    @MethodSource("allowedRetries")
    void 이전_버전의_실패나_현재_버전의_처리_오류는_재시도를_접수한다(int failedVersion, ExtractionFailureReason failureReason) {
        // given
        LoginResult member = loginAsKakao("retry-eligible-history");
        insertFailedMedia(jdbcTemplate, MEDIA_ID, failedVersion, failureReason);
        insertSharedMedia(jdbcTemplate, ORIGINAL_SHARE_ID, member.memberId(), MEDIA_ID,
                sharedUrl(MEDIA_ID), ORIGINAL_SHARED_AT);

        // when
        Long retriedShareId = requestRetry(member, ORIGINAL_SHARE_ID);

        // then
        assertThat(retriedShareId).isNotEqualTo(ORIGINAL_SHARE_ID);
    }

    private static Stream<Arguments> allowedRetries() {
        return Stream.concat(
                Stream.of(ExtractionFailureReason.values())
                        .map(reason -> Arguments.of(PREVIOUS_VERSION, reason)),
                Stream.of(ExtractionFailureReason.PROCESSING_FAILED, ExtractionFailureReason.UNEXPECTED)
                        .map(reason -> Arguments.of(CURRENT_VERSION, reason))
        );
    }

    @ParameterizedTest
    @MethodSource("deniedRetries")
    void 현재_버전의_대상_외_실패를_재시도하면_400_예외를_던진다(
            int failedVersion,
            ExtractionFailureReason failureReason
    ) {
        // given
        LoginResult member = loginAsKakao("retry-ineligible-history");
        insertFailedMedia(jdbcTemplate, MEDIA_ID, failedVersion, failureReason);
        insertSharedMedia(jdbcTemplate, ORIGINAL_SHARE_ID, member.memberId(), MEDIA_ID,
                sharedUrl(MEDIA_ID), ORIGINAL_SHARED_AT);
        RetryDataSnapshot previous = readRetryData();

        // when
        Response response = sendRetry(member, ORIGINAL_SHARE_ID);

        // then
        assertRejected(response, MediaErrorCode.RETRY_NOT_ELIGIBLE, previous);
    }

    private static Stream<Arguments> deniedRetries() {
        return Stream.of(
                        ExtractionFailureReason.CONTENT_UNAVAILABLE,
                        ExtractionFailureReason.PLACE_NOT_EXTRACTED,
                        ExtractionFailureReason.PLACE_NOT_MATCHED
                )
                .map(reason -> Arguments.of(CURRENT_VERSION, reason));
    }

    @Test
    void 재시도_성공은_새_히스토리와_보관함에_반영하고_다른_회원의_실패와_보관함은_유지한다() throws Exception {
        // given
        LoginResult memberA = loginAsKakao("retry-success-member-a");
        LoginResult memberB = loginAsKakao("retry-success-member-b");
        createFailedHistory(memberA, ORIGINAL_SHARE_ID, ExtractionFailureReason.UNEXPECTED);
        insertSharedMedia(jdbcTemplate, OTHER_SHARE_ID, memberB.memberId(), MEDIA_ID,
                sharedUrl(MEDIA_ID), ORIGINAL_SHARED_AT);
        List<Long> previousHistoryB = readHistoryIds(memberB);
        List<Long> previousSavedSharesB = readSavedShareIds(memberB);
        List<Long> previousSavedPlacesB = readSavedPlaceIds(memberB);

        // when
        Long retriedShareId = requestRetry(memberA, ORIGINAL_SHARE_ID);
        completeExtraction();

        // then
        assertAll(
                () -> assertSucceededHistory(memberA, retriedShareId),
                () -> assertFailedHistory(memberA, ORIGINAL_SHARE_ID),
                () -> assertFailedHistory(memberB, OTHER_SHARE_ID),
                () -> assertThat(countSavedPlacesFromShare(retriedShareId)).isEqualTo(1),
                () -> assertThat(countSavedPlacesFromShare(ORIGINAL_SHARE_ID)).isZero(),
                () -> assertThat(countSavedPlacesFromShare(OTHER_SHARE_ID)).isZero(),
                () -> assertThat(readHistoryIds(memberB)).isEqualTo(previousHistoryB),
                () -> assertThat(readSavedShareIds(memberB)).isEqualTo(previousSavedSharesB),
                () -> assertThat(readSavedPlaceIds(memberA)).hasSize(1),
                () -> assertThat(readSavedPlaceIds(memberB)).isEqualTo(previousSavedPlacesB)
        );
    }

    @Test
    void 본인_실패_후_다른_회원이_성공한_미디어를_재시도하면_성공_히스토리와_장소를_보관함에_저장한다() throws Exception {
        // given
        LoginResult memberA = loginAsKakao("retry-cached-success-member-a");
        LoginResult memberB = loginAsKakao("retry-cached-success-member-b");
        insertFailedMedia(jdbcTemplate, MEDIA_ID, PREVIOUS_VERSION, ExtractionFailureReason.UNEXPECTED);
        insertSharedMedia(jdbcTemplate, ORIGINAL_SHARE_ID, memberA.memberId(), MEDIA_ID,
                sharedUrl(MEDIA_ID), ORIGINAL_SHARED_AT);
        shareAndCompleteExtraction(memberB);
        List<Long> previousHistoryB = readHistoryIds(memberB);
        Long succeededShareB = previousHistoryB.getFirst();
        assertSucceededHistory(memberB, succeededShareB);
        List<Long> previousSavedSharesB = readSavedShareIds(memberB);
        List<Long> previousSavedPlacesB = readSavedPlaceIds(memberB);
        List<Map<String, Object>> previousMedia = jdbcTemplate.queryForList("SELECT * FROM media ORDER BY id");

        // when
        Long retriedShareId = requestSucceededRetry(memberA, ORIGINAL_SHARE_ID);

        // then
        assertAll(
                () -> assertThat(retriedShareId)
                        .isNotEqualTo(ORIGINAL_SHARE_ID)
                        .isNotEqualTo(succeededShareB),
                () -> assertSucceededHistory(memberA, retriedShareId),
                () -> assertFailedHistory(memberA, ORIGINAL_SHARE_ID),
                () -> assertThat(readHistoryIds(memberA)).containsExactly(retriedShareId, ORIGINAL_SHARE_ID),
                () -> assertThat(countSavedPlacesFromShare(retriedShareId)).isEqualTo(1),
                () -> assertThat(countSavedPlacesFromShare(ORIGINAL_SHARE_ID)).isZero(),
                () -> assertThat(readSavedShareIds(memberA)).containsExactly(retriedShareId),
                () -> assertThat(readSavedPlaceIds(memberA)).hasSize(1),
                () -> assertThat(readHistoryIds(memberB)).isEqualTo(previousHistoryB),
                () -> assertThat(readSavedShareIds(memberB)).isEqualTo(previousSavedSharesB),
                () -> assertThat(readSavedPlaceIds(memberB)).isEqualTo(previousSavedPlacesB),
                () -> assertThat(jdbcTemplate.queryForList("SELECT * FROM media ORDER BY id")).isEqualTo(previousMedia),
                () -> assertThat(extractionExecutor.countSubmittedTasks()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1)
        );
    }

    private void shareAndCompleteExtraction(LoginResult member) throws Exception {
        givenBearer(member.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("instagramUrl", sharedUrl(MEDIA_ID)))
                .when()
                .post(SHARES_PATH)
                .then()
                .statusCode(HttpStatus.ACCEPTED.value());
        completeExtraction();
    }

    @Test
    void 본인_재시도가_성공한_뒤_옛_실패를_다시_재시도하면_새_성공_이력과_장소를_저장한다() throws Exception {
        // given
        LoginResult member = loginAsKakao("retry-own-cached-success");
        createFailedHistory(member, ORIGINAL_SHARE_ID, ExtractionFailureReason.UNEXPECTED);
        Long firstRetriedShareId = requestRetry(member, ORIGINAL_SHARE_ID);
        completeExtraction();
        assertSucceededHistory(member, firstRetriedShareId);
        List<Long> previousSavedPlaces = readSavedPlaceIds(member);

        // when
        Long secondRetriedShareId = requestSucceededRetry(member, ORIGINAL_SHARE_ID);

        // then
        assertAll(
                () -> assertThat(secondRetriedShareId)
                        .isNotEqualTo(firstRetriedShareId)
                        .isNotEqualTo(ORIGINAL_SHARE_ID),
                () -> assertSucceededHistory(member, firstRetriedShareId),
                () -> assertSucceededHistory(member, secondRetriedShareId),
                () -> assertFailedHistory(member, ORIGINAL_SHARE_ID),
                () -> assertThat(readHistoryIds(member)).containsExactly(secondRetriedShareId, firstRetriedShareId, ORIGINAL_SHARE_ID),
                () -> assertThat(countSavedPlacesFromShare(secondRetriedShareId)).isEqualTo(1),
                () -> assertThat(countSavedPlacesFromShare(ORIGINAL_SHARE_ID)).isZero(),
                () -> assertThat(readSavedPlaceIds(member)).isEqualTo(previousSavedPlaces),
                () -> assertThat(extractionExecutor.countSubmittedTasks()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1)
        );
    }

    @Test
    void 같은_회원이_분석_중에_다시_재시도하면_기존_이력_ID를_반환한다() throws Exception {
        // given
        LoginResult member = loginAsKakao("retry-join-started-extraction");
        createFailedHistory(member, ORIGINAL_SHARE_ID, ExtractionFailureReason.UNEXPECTED);
        Long firstShareId = requestRetry(member, ORIGINAL_SHARE_ID);
        assertThat(placeNameExtractor.awaitStarted())
                .isTrue();

        // when
        Long secondShareId = requestRetry(member, ORIGINAL_SHARE_ID);

        // then
        assertAll(
                () -> assertThat(secondShareId).isEqualTo(firstShareId),
                () -> assertThat(readHistoryIds(member)).containsExactly(firstShareId, ORIGINAL_SHARE_ID),
                () -> assertThat(readHistory(member, firstShareId).getString("extractionStatus"))
                        .isEqualTo(ExtractionStatus.EXTRACTING.name()),
                () -> assertThat(extractionExecutor.countSubmittedTasks()).isEqualTo(1)
        );
        completeExtraction();
        assertAll(
                () -> assertSucceededHistory(member, firstShareId),
                () -> assertFailedHistory(member, ORIGINAL_SHARE_ID),
                () -> assertThat(readSavedShareIds(member))
                        .containsExactly(firstShareId),
                () -> assertThat(placeNameExtractor.requestCount())
                        .isEqualTo(1)
        );
    }

    @Test
    void 다른_회원이_분석_중에_재시도하면_자신의_새_이력으로_분석에_합류한다() throws Exception {
        // given
        LoginResult memberA = loginAsKakao("retry-join-member-a");
        LoginResult memberB = loginAsKakao("retry-join-member-b");
        createFailedHistory(memberA, ORIGINAL_SHARE_ID, ExtractionFailureReason.UNEXPECTED);
        insertSharedMedia(jdbcTemplate, OTHER_SHARE_ID, memberB.memberId(), MEDIA_ID,
                sharedUrl(MEDIA_ID), ORIGINAL_SHARED_AT);
        Long shareIdA = requestRetry(memberA, ORIGINAL_SHARE_ID);
        assertThat(placeNameExtractor.awaitStarted())
                .isTrue();

        // when
        Long shareIdB = requestRetry(memberB, OTHER_SHARE_ID);

        // then
        assertJoined(List.of(shareIdA, shareIdB), memberA, memberB);
        assertAll(
                () -> assertThat(readHistoryIds(memberA)).containsExactly(shareIdA, ORIGINAL_SHARE_ID),
                () -> assertThat(readHistoryIds(memberB)).containsExactly(shareIdB, OTHER_SHARE_ID)
        );
        completeExtraction();
        assertAll(
                () -> assertSucceededHistory(memberA, shareIdA),
                () -> assertSucceededHistory(memberB, shareIdB),
                () -> assertFailedHistory(memberA, ORIGINAL_SHARE_ID),
                () -> assertFailedHistory(memberB, OTHER_SHARE_ID),
                () -> assertThat(readSavedShareIds(memberA)).containsExactly(shareIdA),
                () -> assertThat(readSavedShareIds(memberB)).containsExactly(shareIdB),
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1)
        );
    }

    private void createFailedHistory(
            LoginResult member,
            Long sharedMediaId,
            ExtractionFailureReason reason
    ) {
        insertFailedMedia(jdbcTemplate, MEDIA_ID, CURRENT_VERSION, reason);
        insertSharedMedia(jdbcTemplate, sharedMediaId, member.memberId(), MEDIA_ID,
                sharedUrl(MEDIA_ID), ORIGINAL_SHARED_AT);
    }

    private void createHistory(LoginResult member, ExtractionStatus status) {
        insertMedia(jdbcTemplate, MEDIA_ID, CURRENT_VERSION, status);
        insertSharedMedia(jdbcTemplate, ORIGINAL_SHARE_ID, member.memberId(), MEDIA_ID,
                sharedUrl(MEDIA_ID), ORIGINAL_SHARED_AT);
    }

    private Long requestRetry(LoginResult member, Long sharedMediaId) {
        return sendRetry(member, sharedMediaId)
                .then()
                .statusCode(HttpStatus.ACCEPTED.value())
                .body("extractionStatus", equalTo(ExtractionStatus.EXTRACTING.name()))
                .extract()
                .jsonPath()
                .getLong("sharedMediaId");
    }

    private Response sendRetry(LoginResult member, Long sharedMediaId) {
        return givenBearer(member.accessToken())
                .when()
                .post(retryPath(sharedMediaId));
    }

    private Long requestSucceededRetry(LoginResult member, Long sharedMediaId) {
        return sendRetry(member, sharedMediaId)
                .then()
                .statusCode(HttpStatus.ACCEPTED.value())
                .body("extractionStatus", equalTo(ExtractionStatus.SUCCEEDED.name()))
                .extract()
                .jsonPath()
                .getLong("sharedMediaId");
    }

    private static String retryPath(Long sharedMediaId) {
        return SHARES_PATH + "/" + sharedMediaId + "/extraction-retries";
    }

    private void assertJoined(
            List<Long> newShareIds,
            LoginResult firstMember,
            LoginResult secondMember
    ) {
        assertAll(
                () -> assertThat(newShareIds)
                        .doesNotHaveDuplicates()
                        .doesNotContain(ORIGINAL_SHARE_ID, OTHER_SHARE_ID),
                () -> assertThat(readHistory(firstMember, newShareIds.getFirst()).getString("extractionStatus"))
                        .isEqualTo(ExtractionStatus.EXTRACTING.name()),
                () -> assertThat(readHistory(secondMember, newShareIds.getLast()).getString("extractionStatus"))
                        .isEqualTo(ExtractionStatus.EXTRACTING.name()),
                () -> assertThat(extractionExecutor.countSubmittedTasks())
                        .isEqualTo(1)
        );
    }

    private void completeExtraction() throws Exception {
        placeNameExtractor.allow();
        extractionExecutor.awaitCompletion();
    }

    private Instant readDatabaseTime() {
        return jdbcTemplate.queryForObject("SELECT CURRENT_TIMESTAMP(6)",
                (resultSet, rowNumber) -> resultSet.getTimestamp(1).toInstant());
    }

    private JsonPath readHistory(LoginResult member, Long sharedMediaId) {
        JsonPath history = givenBearer(member.accessToken())
                .when()
                .get(SHARES_PATH)
                .then()
                .statusCode(HttpStatus.OK.value())
                .extract()
                .jsonPath();
        String item = "sharedMedias.find { it.sharedMediaId == " + sharedMediaId + " }";
        Map<String, Object> sharedMedia = history.getMap(item);
        assertThat(sharedMedia)
                .as("공유 이력 %s가 목록에 존재한다", sharedMediaId)
                .isNotNull();
        return history.setRootPath(item);
    }

    private List<Long> readHistoryIds(LoginResult member) {
        return givenBearer(member.accessToken())
                .when()
                .get(SHARES_PATH)
                .then()
                .statusCode(HttpStatus.OK.value())
                .extract()
                .jsonPath().getList("sharedMedias.sharedMediaId", Long.class);
    }

    private List<Long> readSavedShareIds(LoginResult member) {
        return jdbcTemplate.queryForList("""
                SELECT link.shared_media_id
                FROM shared_media_saved_places link
                JOIN saved_places saved ON saved.id = link.saved_place_id
                WHERE saved.member_id = ?
                ORDER BY link.shared_media_id DESC
                """, Long.class, member.memberId());
    }

    private List<Long> readSavedPlaceIds(LoginResult member) {
        return givenBearer(member.accessToken())
                .when()
                .get("/api/v1/saved-places")
                .then()
                .statusCode(HttpStatus.OK.value())
                .extract()
                .jsonPath().getList("savedPlaces.savedPlaceId", Long.class);
    }

    private void assertFailedHistory(LoginResult member, Long sharedMediaId) {
        JsonPath history = readHistory(member, sharedMediaId);
        assertAll(
                () -> assertThat(history.getString("extractionStatus"))
                        .isEqualTo(ExtractionStatus.FAILED.name()),
                () -> assertThat(history.getString("failureReason"))
                        .isEqualTo(ExtractionFailureReason.UNEXPECTED.name()),
                () -> assertThat(Instant.parse(history.getString("createdAt")))
                        .isEqualTo(ORIGINAL_SHARED_AT)
        );
    }

    private void assertSucceededHistory(LoginResult member, Long sharedMediaId) {
        JsonPath history = readHistory(member, sharedMediaId);
        assertAll(
                () -> assertThat(history.getString("extractionStatus"))
                        .isEqualTo(ExtractionStatus.SUCCEEDED.name()),
                () -> assertThat(history.getString("failureReason"))
                        .isNull()
        );
    }

    private int countSavedPlacesFromShare(Long sharedMediaId) {
        return jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM shared_media_saved_places WHERE shared_media_id = ?
                """, Integer.class, sharedMediaId);
    }

    private void assertRejected(
            Response response,
            ErrorCode errorCode,
            RetryDataSnapshot previous
    ) {
        response
                .then()
                .statusCode(errorCode.getHttpStatus().value())
                .body("errorCode", equalTo(errorCode.getCode()))
                .body("message", equalTo(errorCode.getMessage()));
        assertAll(
                () -> assertThat(readRetryData())
                        .isEqualTo(previous),
                () -> assertThat(extractionExecutor.countSubmittedTasks())
                        .isZero(),
                () -> assertThat(placeNameExtractor.requestCount())
                        .isZero()
        );
    }

    private RetryDataSnapshot readRetryData() {
        return new RetryDataSnapshot(
                jdbcTemplate.queryForList("SELECT * FROM media ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM shared_media ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM saved_places ORDER BY id"),
                jdbcTemplate.queryForList("SELECT * FROM shared_media_saved_places ORDER BY id")
        );
    }

    private record RetryDataSnapshot(
            List<Map<String, Object>> media,
            List<Map<String, Object>> sharedMedia,
            List<Map<String, Object>> savedPlaces,
            List<Map<String, Object>> sharedMediaSavedPlaces
    ) {
    }

    @TestConfiguration
    static class RetryTestConfiguration {

        @Primary
        @Bean(destroyMethod = "close")
        FakeExtractionRetryExecutor fakeExtractionRetryExecutor() {
            return new FakeExtractionRetryExecutor();
        }
    }
}
