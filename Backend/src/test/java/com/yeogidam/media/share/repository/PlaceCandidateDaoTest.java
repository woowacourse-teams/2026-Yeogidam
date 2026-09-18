package com.yeogidam.media.share.repository;

import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMember;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertMedia;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertPlace;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertPlaceCandidate;
import static com.yeogidam.support.PlaceCandidateSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.sql.Timestamp;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(PlaceCandidateDao.class)
class PlaceCandidateDaoTest extends JdbcTestSupport {

    private static final long FIRST_MEMBER_ID = 910001L;
    private static final long SECOND_MEMBER_ID = 910002L;

    private static final long FIRST_MEDIA_ID = 920001L;
    private static final long SECOND_MEDIA_ID = 920002L;
    private static final long THIRD_MEDIA_ID = 920003L;
    private static final long FOURTH_MEDIA_ID = 920004L;

    private static final long FIRST_SHARED_MEDIA_ID = 930001L;
    private static final long SECOND_SHARED_MEDIA_ID = 930002L;
    private static final long THIRD_SHARED_MEDIA_ID = 930003L;
    private static final long FOURTH_SHARED_MEDIA_ID = 930004L;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlaceCandidateDao placeCandidateDao;

    @Test
    void 대기_중인_후보가_있는_내_공유만_최근순으로_조회하고_미디어를_매핑한다() {
        // given
        insertMember(jdbcTemplate, FIRST_MEMBER_ID, "lucky-1234453");
        insertMember(jdbcTemplate, SECOND_MEMBER_ID, "kong-1144254");
        insertMedia(jdbcTemplate, FIRST_MEDIA_ID, "오래된 미디어", "https://img.example.com/old.jpg", "@old");
        insertMedia(jdbcTemplate, SECOND_MEDIA_ID, "최신 미디어", "https://img.example.com/new.jpg", "@new");
        insertMedia(jdbcTemplate, THIRD_MEDIA_ID, "다른 회원 미디어", "https://img.example.com/other.jpg", "@other");
        insertMedia(jdbcTemplate, FOURTH_MEDIA_ID, "결정된 미디어", "https://img.example.com/decided.jpg", "@decided");

        insertSharedMedia(jdbcTemplate, FIRST_SHARED_MEDIA_ID, FIRST_MEMBER_ID, FIRST_MEDIA_ID,
                timestamp("2026-09-17 10:00:00"));
        insertSharedMedia(jdbcTemplate, SECOND_SHARED_MEDIA_ID, FIRST_MEMBER_ID, SECOND_MEDIA_ID,
                timestamp("2026-09-17 11:00:00"));

        insertSharedMedia(jdbcTemplate, THIRD_SHARED_MEDIA_ID, SECOND_MEMBER_ID, THIRD_MEDIA_ID,
                timestamp("2026-09-17 12:00:00"));
        insertSharedMedia(jdbcTemplate, FOURTH_SHARED_MEDIA_ID, FIRST_MEMBER_ID, FOURTH_MEDIA_ID,
                timestamp("2026-09-17 13:00:00"));

        insertPlace(jdbcTemplate, 940001L, "오래된 장소", "https://img.example.com/place-old.jpg", "카페", "서울 성동구");
        insertPlace(jdbcTemplate, 940002L, "최신 장소", "https://img.example.com/place-new.jpg", "카페", "서울 종로구");
        insertPlace(jdbcTemplate, 940003L, "다른 회원 장소", "https://img.example.com/place-other.jpg", "카페", "서울 마포구");
        insertPlace(jdbcTemplate, 940004L, "결정된 장소", "https://img.example.com/place-decided.jpg", "카페", "서울 중구");

        insertPlaceCandidate(jdbcTemplate, 950001L, FIRST_SHARED_MEDIA_ID, 940001L, "UNDECIDED");
        insertPlaceCandidate(jdbcTemplate, 950002L, SECOND_SHARED_MEDIA_ID, 940002L, "UNDECIDED");
        insertPlaceCandidate(jdbcTemplate, 950003L, THIRD_SHARED_MEDIA_ID, 940003L, "UNDECIDED");
        insertPlaceCandidate(jdbcTemplate, 950004L, FOURTH_SHARED_MEDIA_ID, 940004L, "SAVED");

        // when
        List<SharedMediaProjection> sharedMedias = placeCandidateDao.findSharedMedias(FIRST_MEMBER_ID);

        // then
        assertThat(sharedMedias)
                .extracting(SharedMediaProjection::sharedMediaId)
                .containsExactly(SECOND_SHARED_MEDIA_ID, FIRST_SHARED_MEDIA_ID);
        SharedMediaProjection latest = sharedMedias.getFirst();
        assertAll(
                () -> assertThat(latest.thumbnailUrl()).isEqualTo("https://img.example.com/new.jpg"),
                () -> assertThat(latest.caption()).isEqualTo("최신 미디어"),
                () -> assertThat(latest.author()).isEqualTo("@new")
        );
    }

    @Test
    void 여러_공유의_미결정_후보만_후보_ID_오름차순과_주소로_매핑한다() {
        // given
        insertMember(jdbcTemplate, 910003L, "place-candidate-candidate-user");
        insertMedia(jdbcTemplate, 920005L, "미디어", "https://img.example.com/media.jpg", "@author");
        insertSharedMedia(jdbcTemplate, 930005L, 910003L, 920005L, timestamp("2026-09-17 10:00:00"));

        insertPlace(jdbcTemplate, 940005L, "첫 장소", "https://img.example.com/place-1.jpg", "카페",
                "서울 성동구 성수동2가 1-1", "서울 성동구 연무장길 1");
        insertPlace(jdbcTemplate, 940006L, "두 번째 장소", "https://img.example.com/place-2.jpg", "식당",
                "서울 종로구 관철동 1-1", "서울 종로구 삼일대로 1");
        insertPlace(jdbcTemplate, 940007L, "제외할 장소", "https://img.example.com/place-3.jpg", "카페", "서울 중구");

        insertPlaceCandidate(jdbcTemplate, 950005L, 930005L, 940005L, "UNDECIDED");
        insertPlaceCandidate(jdbcTemplate, 950006L, 930005L, 940006L, "SAVED");
        insertPlaceCandidate(jdbcTemplate, 950007L, 930005L, 940007L, "UNDECIDED");

        // when
        List<PlaceCandidateProjection> candidates = placeCandidateDao.findUndecidedCandidates(List.of(930005L));

        // then
        assertThat(candidates)
                .extracting(PlaceCandidateProjection::candidateId)
                .containsExactly(950005L, 950007L);
        PlaceCandidateProjection first = candidates.getFirst();
        assertAll(
                () -> assertThat(first.placeId()).isEqualTo(940005L),
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

    private static Timestamp timestamp(String value) {
        return Timestamp.valueOf(value);
    }
}
