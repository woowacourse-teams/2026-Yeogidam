package com.yeogidam.media.share.service;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertExtractingMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertSavedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.candidateId;
import static com.yeogidam.support.fixture.sql.SavedPlaceShareSqlFixture.insertSavedPlaceShare;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.share.dto.request.PlaceDecisionRequest;
import com.yeogidam.support.IntegrationTestSupport;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.CandidateState;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.SavedPlaceState;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.ShareLinkState;
import com.yeogidam.support.fixture.sql.PlaceDecisionSqlFixture.State;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(PlaceDecisionServiceIntegrationTest.ClockConfig.class)
class PlaceDecisionServiceIntegrationTest extends IntegrationTestSupport {

    private static final Instant NOW = Instant.parse("2026-10-04T01:00:00.123456Z");
    private static final Instant PREVIOUS_SAVE = NOW.minus(Duration.ofHours(1));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlaceDecisionService placeDecisionService;

    private PlaceDecisionSqlFixture fixture;

    @BeforeEach
    void setUp() {
        fixture = new PlaceDecisionSqlFixture(jdbcTemplate);
    }

    @Test
    void 한_요청에서_신규_장소는_생성하고_기존_장소는_재저장하며_각각_공유에_연결한다() {
        // given: 장소 11은 이전 공유에서 저장했고, 장소 12는 이번에 처음 저장한다.
        insertKakaoMember(jdbcTemplate, 1L, "place-decision-integration-user", null, null, null);
        fixture.createPlaces(List.of(11L, 12L));
        fixture.createShare(1L, 101L, 201L, NOW);
        fixture.createUndecidedCandidates(101L, List.of(11L, 12L));
        fixture.createShare(1L, 102L, 202L, PREVIOUS_SAVE);
        insertSavedCandidate(jdbcTemplate, candidateId(102L, 11L), 102L, 11L, PREVIOUS_SAVE);
        insertSavedPlace(jdbcTemplate, 1001L, 1L, 11L, PREVIOUS_SAVE);
        insertSavedPlaceShare(jdbcTemplate, 1L, 1001L, 102L, PREVIOUS_SAVE);
        PlaceDecisionRequest request = new PlaceDecisionRequest(List.of(11L, 12L), "SAVED");

        // when
        placeDecisionService.createPlaceDecisions(1L, 101L, request);

        // then: 기존 보관함 ID와 연결은 유지하고, 후보·보관함·새 연결에 같은 UTC 시각을 기록한다.
        SavedPlaceState saved12 = fixture.savedPlace(1L, 12L);
        assertAll(
                () -> assertThat(fixture.savedPlace(1L, 11L)).isEqualTo(new SavedPlaceState(1001L, NOW)),
                () -> assertThat(saved12.savedPlaceId()).isNotEqualTo(1001L),
                () -> assertThat(saved12.lastSavedAt()).isEqualTo(NOW),
                () -> assertThat(fixture.captureState().savedPlaces()).hasSize(2),
                () -> assertThat(fixture.candidate(101L, 11L)).isEqualTo(new CandidateState("SAVED", NOW)),
                () -> assertThat(fixture.candidate(101L, 12L)).isEqualTo(new CandidateState("SAVED", NOW)),
                () -> assertThat(fixture.shareLinks())
                        .containsExactlyInAnyOrder(
                                new ShareLinkState(1001L, 102L, PREVIOUS_SAVE),
                                new ShareLinkState(1001L, 101L, NOW),
                                new ShareLinkState(saved12.savedPlaceId(), 101L, NOW)));
    }

    @Test
    void 추출_중이라_후보가_아직_발급되지_않았다면_예외가_발생한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "place-decision-integration-user", null, null, null);
        fixture.createPlaces(List.of(11L));
        insertExtractingMedia(jdbcTemplate, 201L);
        fixture.createShareForExistingMedia(1L, 101L, 201L, PREVIOUS_SAVE);
        State before = fixture.captureState();
        PlaceDecisionRequest request = new PlaceDecisionRequest(List.of(11L), "SAVED");

        // when & then
        assertThatThrownBy(() -> placeDecisionService.createPlaceDecisions(1L, 101L, request))
                .isInstanceOf(MediaException.class)
                .hasMessage(MediaErrorCode.EXTRACTION_NOT_FINISHED.getMessage());
        assertThat(fixture.captureState()).isEqualTo(before);
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
