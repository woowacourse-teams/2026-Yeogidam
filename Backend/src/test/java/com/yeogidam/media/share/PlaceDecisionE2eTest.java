package com.yeogidam.media.share;

import static com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.candidateId;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertDiscardedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertSavedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertSupersededCandidate;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static io.restassured.RestAssured.given;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.auth.exception.AuthErrorCode;
import com.yeogidam.global.exception.CommonErrorCode;
import com.yeogidam.global.exception.ErrorCode;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.support.E2eTestSupport;
import com.yeogidam.support.LoginResult;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.CandidateState;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.SavedPlaceState;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.State;
import io.restassured.http.ContentType;
import io.restassured.response.Response;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * API 구현 전에도 컴파일되도록 요청을 JSON으로 보내고 결과는 실제 HTTP와 DB에서 관찰한다.
 */
@Import(PlaceDecisionE2eTest.ClockConfig.class)
class PlaceDecisionE2eTest extends E2eTestSupport {

    private static final String DECISIONS_PATH = "/api/v1/shares/{sharedMediaId}/place-decisions";
    private static final String CANDIDATES_PATH = "/api/v1/place-candidates";
    private static final String SAVED_PLACES_PATH = "/api/v1/saved-places";
    private static final Instant NOW = Instant.parse("2026-10-04T01:00:00.123456Z");
    private static final Instant PREVIOUS_SAVE = NOW.minus(Duration.ofHours(1));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private PlaceDecisionSqlFixture fixture;

    @BeforeEach
    void setUp() {
        fixture = new PlaceDecisionSqlFixture(jdbcTemplate);
    }

    @Test
    void 선택한_후보만_보관함에_저장하고_선택하지_않은_후보는_대기함에_남긴다() {
        // given
        LoginResult login = loginAsKakao("place-decision-user");
        fixture.createPlaces(List.of(11L, 12L, 13L));
        fixture.createShare(login.memberId(), 101L, 201L, PREVIOUS_SAVE);
        fixture.createUndecidedCandidates(101L, List.of(11L, 12L, 13L));
        State before = fixture.captureState();

        // when
        Response response = decide(login, 101L, List.of(11L, 13L), "SAVED");

        // then
        assertCreated(response);
        SavedPlaceState saved11 = fixture.savedPlace(login.memberId(), 11L);
        SavedPlaceState saved13 = fixture.savedPlace(login.memberId(), 13L);
        assertAll(
                () -> assertThat(fixture.candidate(101L, 11L)).isEqualTo(new CandidateState("SAVED", NOW)),
                () -> assertThat(fixture.candidate(101L, 13L)).isEqualTo(new CandidateState("SAVED", NOW)),
                () -> assertThat(fixture.candidate(101L, 12L)).isEqualTo(new CandidateState("UNDECIDED", null)),
                () -> assertThat(saved11.lastSavedAt()).isEqualTo(NOW),
                () -> assertThat(saved13.lastSavedAt()).isEqualTo(NOW),
                () -> assertThat(fixture.linkedShareIds(saved11.savedPlaceId())).containsExactly(101L),
                () -> assertThat(fixture.linkedShareIds(saved13.savedPlaceId())).containsExactly(101L),
                () -> assertThat(fixture.captureState().shares()).isEqualTo(before.shares()));
        givenBearer(login.accessToken())
                .when().get(CANDIDATES_PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(1))
                .body("sharedMedias[0].sharedMediaId", equalTo(101))
                .body("sharedMedias[0].places.placeId", contains(12));
        givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH)
                .then().statusCode(200)
                .body("savedPlaces", hasSize(2));
    }

    @Test
    void 재공유하면_이전_미결정_후보만_SUPERSEDED로_바꾸고_새_후보를_발급한다() {
        // given: 이전 공유에는 저장, 버림, 미결정 후보가 함께 있다.
        LoginResult login = loginAsKakao("place-decision-user");
        fixture.createPlaces(List.of(11L, 12L, 13L));
        createPreviouslySavedPlace(login, 101L, 201L);
        insertDiscardedCandidate(jdbcTemplate, candidateId(101L, 12L), 101L, 12L, PREVIOUS_SAVE);
        fixture.createUndecidedCandidates(101L, List.of(13L));
        fixture.createMediaPlaces(201L, List.of(11L, 12L, 13L));
        State before = fixture.captureState();

        // when: 같은 릴스를 실제 공유 API로 다시 공유한다.
        Response response = givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("instagramUrl", "https://www.instagram.com/reel/fixture-media-201/"))
                .when().post("/api/v1/shares");

        // then: 기존 미결정 후보만 닫고 새 공유에는 모든 장소를 미결정으로 발급한다.
        response.then()
                .statusCode(HttpStatus.ACCEPTED.value())
                .body(emptyString());
        Long newSharedMediaId = fixture.latestSharedMediaId(login.memberId(), 201L);
        State after = fixture.captureState();
        assertAll(
                () -> assertThat(newSharedMediaId).isNotEqualTo(101L),
                () -> assertThat(fixture.candidate(101L, 11L))
                        .isEqualTo(new CandidateState("SAVED", PREVIOUS_SAVE)),
                () -> assertThat(fixture.candidate(101L, 12L))
                        .isEqualTo(new CandidateState("DISCARDED", PREVIOUS_SAVE)),
                () -> assertThat(fixture.candidate(101L, 13L))
                        .isEqualTo(new CandidateState("SUPERSEDED", null)),
                () -> assertThat(fixture.candidate(newSharedMediaId, 11L))
                        .isEqualTo(new CandidateState("UNDECIDED", null)),
                () -> assertThat(fixture.candidate(newSharedMediaId, 12L))
                        .isEqualTo(new CandidateState("UNDECIDED", null)),
                () -> assertThat(fixture.candidate(newSharedMediaId, 13L))
                        .isEqualTo(new CandidateState("UNDECIDED", null)),
                () -> assertThat(after.savedPlaces()).isEqualTo(before.savedPlaces()),
                () -> assertThat(after.links()).isEqualTo(before.links()),
                () -> assertThat(after.shares()).hasSize(2));
        givenBearer(login.accessToken())
                .when().get(CANDIDATES_PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(1))
                .body("sharedMedias[0].sharedMediaId", equalTo(newSharedMediaId.intValue()))
                .body("sharedMedias[0].places.placeId", containsInAnyOrder(11, 12, 13));
        assertRelatedShares(login, 1001L, List.of(101L));
    }

    @Test
    void 같은_릴스를_재공유해_후보를_버리면_기존_보관함과_저장_시각을_유지한다() {
        // given
        LoginResult login = loginAsKakao("place-decision-user");
        fixture.createPlaces(List.of(11L, 13L));
        createPreviouslySavedPlace(login, 101L, 201L);
        // 이전 공유의 미결정 후보가 재공유로 SUPERSEDED가 된 상태를 준비한다.
        insertSupersededCandidate(jdbcTemplate, candidateId(101L, 13L), 101L, 13L);
        fixture.createShareForExistingMedia(login.memberId(), 102L, 201L, NOW);
        fixture.createUndecidedCandidates(102L, List.of(11L, 13L));
        State before = fixture.captureState();

        // when
        Response response = decide(login, 102L, List.of(11L, 13L), "DISCARDED");

        // then
        assertCreated(response);
        State after = fixture.captureState();
        assertAll(
                () -> assertThat(fixture.candidate(102L, 11L)).isEqualTo(new CandidateState("DISCARDED", NOW)),
                () -> assertThat(fixture.candidate(102L, 13L)).isEqualTo(new CandidateState("DISCARDED", NOW)),
                () -> assertThat(fixture.candidate(101L, 11L))
                        .isEqualTo(new CandidateState("SAVED", PREVIOUS_SAVE)),
                () -> assertThat(fixture.candidate(101L, 13L))
                        .isEqualTo(new CandidateState("SUPERSEDED", null)),
                () -> assertThat(after.candidates()).hasSameSizeAs(before.candidates()),
                () -> assertThat(after.savedPlaces()).isEqualTo(before.savedPlaces()),
                () -> assertThat(after.links()).isEqualTo(before.links()),
                () -> assertThat(after.shares()).isEqualTo(before.shares()));
        assertInboxEmpty(login);
        assertRelatedShares(login, 1001L, List.of(101L));
    }

    @Test
    void 다른_릴스에서_같은_장소를_저장하면_보관함은_재사용하고_저장한_공유만_연결한다() {
        // given: 첫 릴스에서는 한 시간 전에 저장했고, 두 번째 릴스의 후보는 아직 미결정이다.
        LoginResult login = loginAsKakao("place-decision-user");
        fixture.createPlaces(List.of(11L));
        createPreviouslySavedPlace(login, 101L, 201L);
        fixture.createShare(login.memberId(), 102L, 202L, NOW);
        fixture.createUndecidedCandidates(102L, List.of(11L));
        SavedPlaceState savedBefore = fixture.savedPlace(login.memberId(), 11L);
        assertRelatedShares(login, savedBefore.savedPlaceId(), List.of(101L));

        // when: 두 번째 릴스에서도 같은 장소를 저장한다.
        Response response = decide(login, 102L, List.of(11L), "SAVED");

        // then: 같은 보관함 행의 시각을 갱신하고 두 릴스를 모두 연결한다.
        assertCreated(response);
        SavedPlaceState savedAfter = fixture.savedPlace(login.memberId(), 11L);
        assertAll(
                () -> assertThat(fixture.captureState().savedPlaces()).hasSize(1),
                () -> assertThat(savedAfter.savedPlaceId()).isEqualTo(savedBefore.savedPlaceId()),
                () -> assertThat(savedAfter.lastSavedAt())
                        .isEqualTo(NOW)
                        .isAfter(savedBefore.lastSavedAt()),
                () -> assertThat(fixture.candidate(101L, 11L))
                        .isEqualTo(new CandidateState("SAVED", PREVIOUS_SAVE)),
                () -> assertThat(fixture.candidate(102L, 11L))
                        .isEqualTo(new CandidateState("SAVED", NOW)),
                () -> assertThat(fixture.linkedShareIds(savedBefore.savedPlaceId()))
                        .containsExactly(101L, 102L));
        assertRelatedShares(login, savedBefore.savedPlaceId(), List.of(102L, 101L));
        assertInboxEmpty(login);
    }

    @Test
    void 같은_릴스를_재공유해_다시_저장하면_기존_보관함의_저장_시각을_갱신한다() {
        // given
        LoginResult login = loginAsKakao("place-decision-user");
        fixture.createPlaces(List.of(11L));
        createPreviouslySavedPlace(login, 101L, 201L);
        fixture.createShareForExistingMedia(login.memberId(), 102L, 201L, NOW);
        fixture.createUndecidedCandidates(102L, List.of(11L));
        State before = fixture.captureState();
        SavedPlaceState savedBefore = fixture.savedPlace(login.memberId(), 11L);

        // when
        Response response = decide(login, 102L, List.of(11L), "SAVED");

        // then
        assertCreated(response);
        State after = fixture.captureState();
        assertAll(
                () -> assertThat(fixture.savedPlace(login.memberId(), 11L))
                        .isEqualTo(new SavedPlaceState(savedBefore.savedPlaceId(), NOW)),
                () -> assertThat(after.savedPlaces()).hasSameSizeAs(before.savedPlaces()),
                () -> assertThat(fixture.candidate(101L, 11L))
                        .isEqualTo(new CandidateState("SAVED", PREVIOUS_SAVE)),
                () -> assertThat(fixture.candidate(102L, 11L)).isEqualTo(new CandidateState("SAVED", NOW)),
                () -> assertThat(fixture.linkedShareIds(savedBefore.savedPlaceId())).containsExactly(101L, 102L),
                () -> assertThat(after.links()).hasSize(2),
                () -> assertThat(after.shares()).isEqualTo(before.shares()));
        assertRelatedShares(login, savedBefore.savedPlaceId(), List.of(102L));
        assertInboxEmpty(login);
    }

    @MethodSource("invalidRequests")
    @ParameterizedTest(name = "{0}")
    void 잘못된_결정을_요청하면_변경_없이_400_예외를_던진다(
            String scenario,
            String body,
            ErrorCode errorCode
    ) {
        // given
        LoginResult login = loginAsKakao("place-decision-user");
        fixture.createPlaces(List.of(11L, 12L, 13L));
        fixture.createShare(login.memberId(), 101L, 201L, PREVIOUS_SAVE);
        fixture.createShare(login.memberId(), 102L, 202L, PREVIOUS_SAVE);
        fixture.createUndecidedCandidates(101L, List.of(11L, 12L));
        fixture.createUndecidedCandidates(102L, List.of(13L));
        State before = fixture.captureState();

        // when
        Response response = givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(body)
                .when().post(DECISIONS_PATH, 101L);

        // then
        assertAll(
                () -> assertError(response, errorCode),
                () -> assertThat(fixture.captureState()).isEqualTo(before));
    }

    private static Stream<Arguments> invalidRequests() {
        return Stream.of(
                Arguments.of("빈 장소 목록", """
                        {"placeIds": [], "decision": "SAVED"}
                        """, CommonErrorCode.METHOD_ARGUMENT_NOT_VALID),
                Arguments.of("결정 누락", """
                        {"placeIds": [11]}
                        """, CommonErrorCode.METHOD_ARGUMENT_NOT_VALID),
                Arguments.of("허용하지 않는 결정", """
                        {"placeIds": [11], "decision": "UNDECIDED"}
                        """, CommonErrorCode.METHOD_ARGUMENT_NOT_VALID),
                Arguments.of("다른 공유의 후보가 섞인 요청", """
                        {"placeIds": [11, 13], "decision": "SAVED"}
                        """, MediaErrorCode.NOT_A_CANDIDATE));
    }

    @Test
    void 토큰_없이_결정을_요청하면_변경_없이_401_예외를_던진다() {
        // given
        LoginResult login = loginAsKakao("place-decision-user");
        fixture.createPlaces(List.of(11L));
        fixture.createShare(login.memberId(), 101L, 201L, PREVIOUS_SAVE);
        fixture.createUndecidedCandidates(101L, List.of(11L));
        State before = fixture.captureState();

        // when
        Response response = given()
                .contentType(ContentType.JSON)
                .body(Map.of("placeIds", List.of(11L), "decision", "SAVED"))
                .when().post(DECISIONS_PATH, 101L);

        // then
        assertAll(
                () -> assertError(response, AuthErrorCode.AUTHENTICATION_REQUIRED),
                () -> assertThat(fixture.captureState()).isEqualTo(before));
    }

    @ParameterizedTest
    @ValueSource(longs = {102L, 999L})
    void 남의_공유나_없는_공유에_결정을_요청하면_변경_없이_404_예외를_던진다(Long sharedMediaId) {
        // given
        LoginResult login = loginAsKakao("place-decision-user");
        LoginResult other = loginAsKakao("place-decision-other");
        fixture.createPlaces(List.of(11L));
        fixture.createShare(login.memberId(), 101L, 201L, PREVIOUS_SAVE);
        fixture.createShare(other.memberId(), 102L, 202L, PREVIOUS_SAVE);
        fixture.createUndecidedCandidates(101L, List.of(11L));
        fixture.createUndecidedCandidates(102L, List.of(11L));
        State before = fixture.captureState();

        // when
        Response response = decide(login, sharedMediaId, List.of(11L), "SAVED");

        // then
        assertAll(
                () -> assertError(response, MediaErrorCode.SHARED_MEDIA_NOT_FOUND),
                () -> assertThat(fixture.captureState()).isEqualTo(before));
    }

    private void createPreviouslySavedPlace(LoginResult login, Long sharedMediaId, Long mediaId) {
        fixture.createShare(login.memberId(), sharedMediaId, mediaId, PREVIOUS_SAVE);
        insertSavedCandidate(jdbcTemplate, candidateId(sharedMediaId, 11L), sharedMediaId, 11L, PREVIOUS_SAVE);
        insertSavedPlace(jdbcTemplate, 1001L, login.memberId(), 11L, PREVIOUS_SAVE);
        insertSavedPlaceShare(jdbcTemplate, 1L, 1001L, sharedMediaId, PREVIOUS_SAVE);
    }

    private Response decide(LoginResult login, Long sharedMediaId, List<Long> placeIds, String decision) {
        return givenBearer(login.accessToken())
                .contentType(ContentType.JSON)
                .body(Map.of("placeIds", placeIds, "decision", decision))
                .when().post(DECISIONS_PATH, sharedMediaId);
    }

    private void assertCreated(Response response) {
        response.then()
                .statusCode(HttpStatus.CREATED.value())
                .body(emptyString());
    }

    private void assertError(Response response, ErrorCode errorCode) {
        response.then()
                .statusCode(errorCode.getHttpStatus().value())
                .body("errorCode", equalTo(errorCode.getCode()))
                .body("message", equalTo(errorCode.getMessage()));
    }

    private void assertInboxEmpty(LoginResult login) {
        givenBearer(login.accessToken())
                .when().get(CANDIDATES_PATH)
                .then().statusCode(200)
                .body("sharedMedias", hasSize(0));
    }

    private void assertRelatedShares(LoginResult login, Long savedPlaceId, List<Long> expectedShareIds) {
        List<Long> sharedMediaIds = givenBearer(login.accessToken())
                .when().get(SAVED_PLACES_PATH + "/{savedPlaceId}/media", savedPlaceId)
                .then().statusCode(200)
                .extract().jsonPath().getList("media.sharedMediaId", Long.class);
        assertThat(sharedMediaIds).containsExactlyElementsOf(expectedShareIds);
    }

    @TestConfiguration
    static class ClockConfig {

        @Bean
        @Primary
        Clock placeDecisionClock() {
            return Clock.fixed(NOW, ZoneOffset.UTC);
        }
    }
}
