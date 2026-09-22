package com.yeogidam.media.share.repository;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.createMedia;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertDiscardedCandidate;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertSavedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceCandidateSqlFixture.insertUndecidedCandidate;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.createSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(PlaceCandidateDao.class)
class PlaceCandidateDaoTest extends JdbcTestSupport {

    private static final BigDecimal FIXTURE_LATITUDE = new BigDecimal("37.5796");
    private static final BigDecimal FIXTURE_LONGITUDE = new BigDecimal("126.9770");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlaceCandidateDao placeCandidateDao;

    @Test
    void 대기_중인_후보가_있는_내_공유만_최근순으로_조회하고_미디어를_매핑한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "lucky-1234453", "lucky-1234453",
                "lucky-1234453@example.com", "https://img.example.com/lucky-1234453");
        insertKakaoMember(jdbcTemplate, 2L, "kong-1144254", "kong-1144254",
                "kong-1144254@example.com", "https://img.example.com/kong-1144254");

        createMedia(jdbcTemplate, 1L, "오래된 미디어", "https://img.example.com/old.jpg", "@old");
        createMedia(jdbcTemplate, 2L, "최신 미디어", "https://img.example.com/new.jpg", "@new");
        createMedia(jdbcTemplate, 3L, "다른 회원 미디어", "https://img.example.com/other.jpg",
                "@other");
        createMedia(jdbcTemplate, 4L, "결정된 미디어", "https://img.example.com/decided.jpg",
                "@decided");

        createSharedMedia(jdbcTemplate, 1L, 1L, 1L,
                timestamp("2026-09-17 10:00:00"));
        createSharedMedia(jdbcTemplate, 2L, 1L, 2L,
                timestamp("2026-09-17 11:00:00"));

        createSharedMedia(jdbcTemplate, 3L, 2L, 3L,
                timestamp("2026-09-17 12:00:00"));
        createSharedMedia(jdbcTemplate, 4L, 1L, 4L,
                timestamp("2026-09-17 13:00:00"));

        insertPlace(jdbcTemplate, 1L, "kakao-fixture-1", "오래된 장소", "카페", "서울 성동구",
                "서울 성동구", FIXTURE_LATITUDE, FIXTURE_LONGITUDE,
                "https://place.map.kakao.com/1", null,
                "https://img.example.com/place-old.jpg", null, null);
        insertPlace(jdbcTemplate, 2L, "kakao-fixture-2", "최신 장소", "카페", "서울 종로구",
                "서울 종로구", FIXTURE_LATITUDE, FIXTURE_LONGITUDE,
                "https://place.map.kakao.com/2", null,
                "https://img.example.com/place-new.jpg", null, null);
        insertPlace(jdbcTemplate, 3L, "kakao-fixture-3", "다른 회원 장소", "카페", "서울 마포구",
                "서울 마포구", FIXTURE_LATITUDE, FIXTURE_LONGITUDE,
                "https://place.map.kakao.com/3", null,
                "https://img.example.com/place-other.jpg", null, null);
        insertPlace(jdbcTemplate, 4L, "kakao-fixture-4", "결정된 장소", "카페", "서울 중구",
                "서울 중구", FIXTURE_LATITUDE, FIXTURE_LONGITUDE,
                "https://place.map.kakao.com/4", null,
                "https://img.example.com/place-decided.jpg", null, null);

        insertUndecidedCandidate(jdbcTemplate, 1L, 1L, 1L);
        insertUndecidedCandidate(jdbcTemplate, 2L, 2L, 2L);
        insertUndecidedCandidate(jdbcTemplate, 3L, 3L, 3L);
        insertSavedCandidate(jdbcTemplate, 4L, 4L, 4L,
                timestamp("2026-09-17 10:00:00"));

        // when
        List<SharedMediaSummaryProjection> sharedMedias = placeCandidateDao.findSharedMedias(1L);

        // then
        assertThat(sharedMedias)
                .extracting(SharedMediaSummaryProjection::sharedMediaId)
                .containsExactly(2L, 1L);
        SharedMediaSummaryProjection latest = sharedMedias.getFirst();
        assertAll(
                () -> assertThat(latest.thumbnailUrl()).isEqualTo("https://img.example.com/new.jpg"),
                () -> assertThat(latest.caption()).isEqualTo("최신 미디어"),
                () -> assertThat(latest.author()).isEqualTo("@new")
        );
    }

    @Test
    void 여러_공유의_미결정_후보만_후보_ID_오름차순과_주소로_매핑한다() {
        // given
        insertKakaoMember(jdbcTemplate, 3L, "place-candidate-candidate-user",
                "place-candidate-candidate-user", "place-candidate-candidate-user@example.com",
                "https://img.example.com/place-candidate-candidate-user");
        createMedia(jdbcTemplate, 5L, "미디어", "https://img.example.com/media.jpg", "@author");
        createSharedMedia(jdbcTemplate, 5L, 3L, 5L,
                timestamp("2026-09-17 10:00:00"));

        insertPlace(jdbcTemplate, 5L, "kakao-fixture-5", "첫 장소", "카페",
                "서울 성동구 성수동2가 1-1", "서울 성동구 연무장길 1", FIXTURE_LATITUDE,
                FIXTURE_LONGITUDE, "https://place.map.kakao.com/5", null,
                "https://img.example.com/place-1.jpg", null, null);
        insertPlace(jdbcTemplate, 6L, "kakao-fixture-6", "두 번째 장소", "식당",
                "서울 종로구 관철동 1-1", "서울 종로구 삼일대로 1", FIXTURE_LATITUDE,
                FIXTURE_LONGITUDE, "https://place.map.kakao.com/6", null,
                "https://img.example.com/place-2.jpg", null, null);
        insertPlace(jdbcTemplate, 7L, "kakao-fixture-7", "제외할 장소", "카페", "서울 중구",
                "서울 중구", FIXTURE_LATITUDE, FIXTURE_LONGITUDE,
                "https://place.map.kakao.com/7", null,
                "https://img.example.com/place-3.jpg", null, null);

        insertUndecidedCandidate(jdbcTemplate, 5L, 5L, 5L);
        insertSavedCandidate(jdbcTemplate, 6L, 5L, 6L,
                timestamp("2026-09-17 10:00:00"));
        insertUndecidedCandidate(jdbcTemplate, 7L, 5L, 7L);

        // when
        List<PlaceCandidateProjection> candidates = placeCandidateDao.findUndecidedCandidates(List.of(5L));

        // then
        assertThat(candidates)
                .extracting(PlaceCandidateProjection::candidateId)
                .containsExactly(5L, 7L);
        PlaceCandidateProjection first = candidates.getFirst();
        assertAll(
                () -> assertThat(first.placeId()).isEqualTo(5L),
                () -> assertThat(first.name()).isEqualTo("첫 장소"),
                () -> assertThat(first.category()).isEqualTo("카페"),
                () -> assertThat(first.landLotAddress()).isEqualTo("서울 성동구 성수동2가 1-1"),
                () -> assertThat(first.roadAddress()).isEqualTo("서울 성동구 연무장길 1")
        );
    }

    @Test
    void 공유_미디어_ID가_비어_있으면_빈_후보를_반환한다() {
        // when
        List<PlaceCandidateProjection> candidates = placeCandidateDao.findUndecidedCandidates(List.of());

        // then
        assertThat(candidates).isEmpty();
    }

    @Test
    void 공유_결과의_모든_장소_후보를_후보_ID_오름차순으로_조회한다() {
        // given
        insertKakaoMember(jdbcTemplate, 4L, "share-result-candidate-user",
                "share-result-candidate-user", "share-result-candidate-user@example.com",
                "https://img.example.com/share-result-candidate-user");
        createMedia(jdbcTemplate, 8L, "장소 모음", "https://img.example.com/media.jpg", "@author");
        createSharedMedia(jdbcTemplate, 8L, 4L, 8L,
                timestamp("2026-09-17 10:00:00"));

        insertPlace(jdbcTemplate, 8L, "kakao-fixture-8", "첫 장소", "카페",
                "서울 성동구 성수동2가 1-1", "서울 성동구 연무장길 1", FIXTURE_LATITUDE,
                FIXTURE_LONGITUDE, "https://place.map.kakao.com/8", null,
                "https://img.example.com/place-1.jpg", null, null);
        insertPlace(jdbcTemplate, 9L, "kakao-fixture-9", "두 번째 장소", "식당",
                "서울 종로구 관철동 1-1", "서울 종로구 삼일대로 1", FIXTURE_LATITUDE,
                FIXTURE_LONGITUDE, "https://place.map.kakao.com/9", null,
                "https://img.example.com/place-2.jpg", null, null);
        insertPlace(jdbcTemplate, 10L, "kakao-fixture-10", "세 번째 장소", "카페",
                "서울 중구 명동 1-1", "서울 중구 남대문로 1", FIXTURE_LATITUDE,
                FIXTURE_LONGITUDE, "https://place.map.kakao.com/10", null,
                "https://img.example.com/place-3.jpg", null, null);

        insertDiscardedCandidate(jdbcTemplate, 8L, 8L, 9L,
                timestamp("2026-09-17 10:00:00"));
        insertUndecidedCandidate(jdbcTemplate, 9L, 8L, 8L);
        insertSavedCandidate(jdbcTemplate, 10L, 8L, 10L,
                timestamp("2026-09-17 10:00:00"));

        // when
        List<PlaceCandidateProjection> candidates = placeCandidateDao.findCandidates(8L);

        // then
        assertThat(candidates)
                .extracting(PlaceCandidateProjection::candidateId)
                .containsExactly(8L, 9L, 10L);

        PlaceCandidateProjection first = candidates.getFirst();
        assertAll(
                () -> assertThat(first.thumbnailUrl()).isEqualTo("https://img.example.com/place-2.jpg"),
                () -> assertThat(first.name()).isEqualTo("두 번째 장소"),
                () -> assertThat(first.category()).isEqualTo("식당"),
                () -> assertThat(first.landLotAddress()).isEqualTo("서울 종로구 관철동 1-1"),
                () -> assertThat(first.roadAddress()).isEqualTo("서울 종로구 삼일대로 1")
        );
    }

    private static Timestamp timestamp(String value) {
        return Timestamp.valueOf(value);
    }
}
