package com.yeogidam.place.repository;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertDeletedSharedMedia;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(PlaceDao.class)
@ImportAutoConfiguration(JacksonAutoConfiguration.class)
class PlaceDaoTest extends JdbcTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private PlaceDao placeDao;

    @Test
    void 장소_상세_목록은_공유와_게시물_정보를_빠짐없이_읽는다() {
        // given: 게시물 21에서 장소 1이 추출됐고, 회원 31이 게시물 21을 공유했다
        insertMemberAndPlace(31L);
        insertMedia(jdbcTemplate, 21L, "성수 카페 모음", "21.jpg", "@seongsu");
        insertMediaPlace(jdbcTemplate, 21L, 21L, 1L);
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, Instant.parse("2026-11-01T10:00:00.123456Z"));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares).containsExactly(new PlaceMediaProjection(
                1L,
                "21.jpg",
                "@seongsu",
                "성수 카페 모음",
                "https://www.instagram.com/reel/fixture-1/",
                Instant.parse("2026-11-01T10:00:00.123456Z")
        ));
    }

    @Test
    void 장소_상세_목록은_해당_장소가_추출된_게시물의_공유만_읽는다() {
        // given: 게시물 21에서는 장소 1이, 게시물 22에서는 장소 2만 추출됐고 회원 31이 두 게시물을 모두 공유했다
        insertMemberAndPlace(31L);
        insertPlaceOnly(2L);
        insertMediaWithPlace(21L);
        insertMedia(jdbcTemplate, 22L, "게시물 22", "22.jpg", "@author");
        insertMediaPlace(jdbcTemplate, 22L, 22L, 2L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 22L, base.plusSeconds(1));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 장소_상세_목록에_다른_회원의_공유는_섞이지_않는다() {
        // given: 회원 31이 게시물 21을 공유 1로 공유한 뒤 회원 32가 같은 게시물을 공유 2로 공유했다
        insertMemberAndPlace(31L);
        insertKakaoMember(jdbcTemplate, 32L, "place-media-other", null, null, null);
        insertMediaWithPlace(21L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 32L, 21L, base.plusSeconds(1));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    @Test
    void 내_공유가_실패했으면_다른_회원의_공유로_게시물_추출이_성공해도_장소_상세_목록에서_빠진다() {
        // given: 회원 31의 공유 1은 분석에 실패했고, 나중에 회원 32의 공유 2로 게시물 21의 추출이 성공해 장소 1이 나왔다
        insertMemberAndPlace(31L);
        insertKakaoMember(jdbcTemplate, 32L, "place-media-other", null, null, null);
        insertMediaWithPlace(21L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base, new ExtractionSnapshot(
                ExtractionStatus.FAILED, ExtractionFailureReason.PROCESSING_FAILED, 1, MediaSourceType.EXTRACTED));
        insertSharedMedia(jdbcTemplate, 2L, 32L, 21L, base.plusSeconds(1));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares).isEmpty();
    }

    @Test
    void 같은_게시물을_다시_공유했으면_장소_상세_목록에_가장_최근_공유_한_건만_나온다() {
        // given: 회원 31이 게시물 21을 공유 1, 2로 두 번 공유했다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 21L, base.plusSeconds(1));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 장소_상세_목록은_게시물을_가장_최근에_공유한_순서로_정렬한다() {
        // given: 게시물 21을 공유 1로, 게시물 22를 공유 2로 차례로 공유한 뒤 게시물 21을 공유 3으로 다시 공유했다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        insertMediaWithPlace(22L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 22L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 3L, 31L, 21L, base.plusSeconds(2));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(3L, 2L);
    }

    @Test
    void 장소_상세_목록은_ID보다_공유_시각을_먼저_보고_정렬한다() {
        // given: 게시물 21은 공유 10으로 10-05에, 게시물 22는 공유 9로 10-06에 공유해서 ID 순서와 공유 시각 순서가 반대다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        insertMediaWithPlace(22L);
        insertSharedMedia(jdbcTemplate, 10L, 31L, 21L, Instant.parse("2026-10-05T10:00:00Z"));
        insertSharedMedia(jdbcTemplate, 9L, 31L, 22L, Instant.parse("2026-10-06T10:00:00Z"));

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then: ID가 작아도 공유 시각이 늦은 공유 9가 앞에 온다
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(9L, 10L);
    }

    @Test
    void 장소_상세_목록은_공유_시각이_같으면_ID가_큰_공유를_남긴다() {
        // given: 회원 31이 게시물 21을 같은 시각에 공유 1, 2로 두 번 공유했다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        Instant sameTime = Instant.parse("2026-11-05T10:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, sameTime);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 21L, sameTime);

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 장소_상세_목록에서_지운_공유는_빠진다() {
        // given: 게시물 21의 공유 1은 지웠고 게시물 22의 공유 2는 남아 있으며, 두 게시물 모두 장소 1이 추출됐다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        insertMediaWithPlace(22L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertDeletedSharedMedia(jdbcTemplate, 1L, 31L, 21L, base.plusSeconds(1), base.plusSeconds(10));
        insertSharedMedia(jdbcTemplate, 2L, 31L, 22L, base);

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(2L);
    }

    @Test
    void 장소_상세_목록은_공유_시각이_같은_게시물을_ID가_큰_공유부터_정렬한다() {
        // given: 게시물 21, 22, 23을 같은 시각에 공유 1, 2, 3으로 한 번씩 공유했다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        insertMediaWithPlace(22L);
        insertMediaWithPlace(23L);
        Instant sameTime = Instant.parse("2026-11-05T10:00:00.123456Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, sameTime);
        insertSharedMedia(jdbcTemplate, 2L, 31L, 22L, sameTime);
        insertSharedMedia(jdbcTemplate, 3L, 31L, 23L, sameTime);

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(3L, 2L, 1L);
    }

    @Test
    void 장소_상세_목록은_ID가_작아도_공유_시각이_늦은_공유를_남긴다() {
        // given: 게시물 21의 공유 1은 공유 2보다 ID가 작지만 공유 시각은 1초 늦다
        insertMemberAndPlace(31L);
        insertMediaWithPlace(21L);
        Instant base = Instant.parse("2026-11-05T10:00:00Z");
        insertSharedMedia(jdbcTemplate, 1L, 31L, 21L, base.plusSeconds(1));
        insertSharedMedia(jdbcTemplate, 2L, 31L, 21L, base);

        // when
        List<PlaceMediaProjection> shares = placeDao.findMediaByMemberAndPlace(31L, 1L);

        // then
        assertThat(shares)
                .extracting(PlaceMediaProjection::sharedMediaId)
                .containsExactly(1L);
    }

    /**
     * 장소 상세 목록 테스트의 회원과, 게시물에서 추출될 장소 1을 함께 넣는다. 장소는 보관함에 저장하지 않는다.
     */
    private void insertMemberAndPlace(Long memberId) {
        insertKakaoMember(jdbcTemplate, memberId, "place-media-owner-" + memberId, null, null, null);
        insertPlaceOnly(1L);
    }

    /**
     * 보관함에 저장하지 않은 장소만 넣는다.
     */
    private void insertPlaceOnly(Long placeId) {
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, placeId, "place-media-" + placeId, "성수 카페",
                "서울 성동구 성수동2가 1-1", new BigDecimal("37.5446"), new BigDecimal("127.0559"));
    }

    /**
     * 게시물을 넣고 장소 1이 추출된 것으로 둔다. 추출 결과 ID는 게시물 ID와 같게 둔다.
     */
    private void insertMediaWithPlace(Long mediaId) {
        insertMedia(jdbcTemplate, mediaId, "게시물 " + mediaId, mediaId + ".jpg", "@author");
        insertMediaPlace(jdbcTemplate, mediaId, mediaId, 1L);
    }
}
