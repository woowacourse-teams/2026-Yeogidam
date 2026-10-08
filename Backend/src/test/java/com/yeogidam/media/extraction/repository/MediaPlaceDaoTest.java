package com.yeogidam.media.extraction.repository;

import static com.yeogidam.support.fixture.sql.MediaPlaceSqlFixture.insertMediaPlace;
import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlace;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.support.JdbcTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(MediaPlaceDao.class)
class MediaPlaceDaoTest extends JdbcTestSupport {

    @Autowired
    private MediaPlaceDao mediaPlaceDao;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 같은_미디어와_장소를_다시_연결해도_기존_연결을_유지한다() {
        // given
        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertPlaces();
        insertMediaPlace(jdbcTemplate, 11L, 1L, 1L);

        // when
        mediaPlaceDao.saveIfAbsent(1L, 1L);

        // then
        String countSameMediaPlaceSql = """
                SELECT COUNT(*)
                FROM media_places
                WHERE media_id = ? AND place_id = ?
                """;
        String findSameMediaPlaceIdSql = """
                SELECT id
                FROM media_places
                WHERE media_id = ? AND place_id = ?
                """;
        assertAll(
                () -> assertThat(jdbcTemplate.queryForObject(countSameMediaPlaceSql, Integer.class, 1L, 1L)).isEqualTo(1),
                () -> assertThat(jdbcTemplate.queryForObject(findSameMediaPlaceIdSql, Long.class, 1L, 1L)).isEqualTo(11L)
        );
    }

    @Test
    void 새로운_미디어와_장소_조합을_연결할_수_있다() {
        // given
        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertMedia(jdbcTemplate, 2L, null, null, null);
        insertPlaces();

        // when
        mediaPlaceDao.saveIfAbsent(1L, 1L);
        mediaPlaceDao.saveIfAbsent(1L, 2L);
        mediaPlaceDao.saveIfAbsent(2L, 1L);

        // then
        String countMediaPlacesSql = """
                SELECT COUNT(*)
                FROM media_places
                """;
        assertAll(
                () -> assertThat(jdbcTemplate.queryForObject(countMediaPlacesSql, Integer.class)).isEqualTo(3),
                () -> assertThat(mediaPlaceDao.findPlaceIds(1L)).containsExactly(1L, 2L),
                () -> assertThat(mediaPlaceDao.findPlaceIds(2L)).containsExactly(1L)
        );
    }

    @Test
    void 미디어에_등록된_장소들을_릴스에서_추출된_순서로_조회한다() {
        // given
        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertMedia(jdbcTemplate, 2L, null, null, null);

        insertPlaces();

        insertMediaPlace(jdbcTemplate, 20L, 1L, 1L);
        insertMediaPlace(jdbcTemplate, 10L, 1L, 2L);
        insertMediaPlace(jdbcTemplate, 5L, 2L, 1L);

        // when
        List<Long> placeIds = mediaPlaceDao.findPlaceIds(1L);

        // then
        assertThat(placeIds).containsExactly(2L, 1L);
    }

    @Test
    void 공유_ID로_조회하면_해당_미디어의_장소를_연결_ID순으로_반환한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "media-place-owner", null, null, null);

        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertSharedMedia(jdbcTemplate, 100L, 1L, 1L, Instant.parse("2026-10-01T10:00:00Z"));

        insertMedia(jdbcTemplate, 2L, null, null, null);
        insertSharedMedia(jdbcTemplate, 200L, 1L, 2L, Instant.parse("2026-10-02T10:00:00Z"));

        insertPlaces();

        insertMediaPlace(jdbcTemplate, 20L, 1L, 1L);
        insertMediaPlace(jdbcTemplate, 10L, 1L, 2L);
        insertMediaPlace(jdbcTemplate, 5L, 2L, 1L);

        // when
        List<MediaPlaceProjection> places = mediaPlaceDao.findBySharedMediaId(100L);

        // then
        assertThat(places).extracting(MediaPlaceProjection::placeId).containsExactly(2L, 1L);
    }

    @Test
    void 연결된_장소가_없거나_공유가_없으면_빈_목록을_반환한다() {
        // given
        insertKakaoMember(jdbcTemplate, 1L, "media-place-empty", null, null, null);
        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertSharedMedia(jdbcTemplate, 100L, 1L, 1L, Instant.parse("2026-10-01T10:00:00Z"));

        // when & then
        assertAll(
                () -> assertThat(mediaPlaceDao.findPlaceIds(1L)).isEmpty(),
                () -> assertThat(mediaPlaceDao.findPlaceIds(999L)).isEmpty(),
                () -> assertThat(mediaPlaceDao.findBySharedMediaId(100L)).isEmpty(),
                () -> assertThat(mediaPlaceDao.findBySharedMediaId(999L)).isEmpty()
        );
    }

    @Test
    void 미디어에서_추출된_장소를_우리_id와_카카오_장소_id_순서대로_조회한다() {
        // given: 장소 2는 미디어 1에만 연결되어 있고, 미디어 3에는 연결된 장소가 없다.
        insertMedia(jdbcTemplate, 1L, null, null, null);
        insertMedia(jdbcTemplate, 2L, null, null, null);
        insertMedia(jdbcTemplate, 3L, null, null, null);
        insertPlaces();
        insertMediaPlace(jdbcTemplate, 11L, 1L, 2L);
        insertMediaPlace(jdbcTemplate, 12L, 2L, 1L);
        insertMediaPlace(jdbcTemplate, 13L, 1L, 1L);

        // when & then
        assertAll(
                () -> assertThat(mediaPlaceDao.findExtractedPlaces(1L).places()).containsExactly(
                        new ExtractedPlaceProjection(2L, "media-place-restaurant"),
                        new ExtractedPlaceProjection(1L, "media-place-cafe")
                ),
                () -> assertThat(mediaPlaceDao.findExtractedPlaces(2L).places()).containsExactly(
                        new ExtractedPlaceProjection(1L, "media-place-cafe")
                ),
                () -> assertThat(mediaPlaceDao.findExtractedPlaces(3L).places()).isEmpty()
        );
    }

    private void insertPlaces() {
        insertPlace(jdbcTemplate, 1L, "media-place-cafe", "성수 카페", "카페",
                "서울 성동구 성수동2가 1-1", "서울 성동구 연무장길 1",
                new BigDecimal("37.5446"), new BigDecimal("127.0559"), null, null, "cafe.jpg", "KAKAO");
        insertPlaceWithRequiredColumnsOnly(jdbcTemplate, 2L, "media-place-restaurant", "종로 식당",
                "서울 종로구 관철동 1-1", new BigDecimal("37.5704"), new BigDecimal("126.9921"));
    }
}
