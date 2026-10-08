package com.yeogidam.media.extraction.service;

import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.config.ExtractionProperties;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.service.ShareService;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import com.yeogidam.place.domain.PlaceThumbnail;
import com.yeogidam.support.IntegrationTestSupport;
import com.yeogidam.support.fake.FakeMediaExtractionConfig;
import com.yeogidam.support.fake.FakePlaceNameExtractor;
import com.yeogidam.support.fake.FakePlaceSearcher;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;

@Import(FakeMediaExtractionConfig.class)
class MediaExtractionPipelineIntegrationTest extends IntegrationTestSupport {

    private static final Long MEMBER_ID = 1L;
    private static final String INSTAGRAM_URL = "https://www.instagram.com/reel/pipeline-2026/";
    private static final String THUMBNAIL_KEY = "yeogidam/instagram-thumbnails/pipeline-2026.jpg";

    @Autowired
    private ShareService shareService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ExtractionProperties extractionProperties;

    @Autowired
    private FakePlaceNameExtractor placeNameExtractor;

    @Autowired
    private FakePlaceSearcher placeSearcher;

    @BeforeEach
    void setUp() {
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "pipeline-user", "pipeline-user",
                "pipeline-user@example.com", null);
        placeNameExtractor.reset();
        placeSearcher.reset();
    }

    @Test
    void 여러_장소를_찾으면_장소와_미디어_관계를_연결하고_보관함에_저장한다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of(hint("올드빅"), hint("Dub.+")));
        placeSearcher.add("올드빅", place("100", "올드빅"));
        placeSearcher.add("Dub.+", place("200", "Dub.+"));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        Long mediaId = mediaId();
        awaitStatus(mediaId, "SUCCEEDED");

        // then
        Map<String, Object> media = jdbcTemplate.queryForMap(
                "SELECT caption, thumbnail_key, author, failure_reason FROM media WHERE id = ?", mediaId);
        assertAll(
                () -> assertThat(media.get("caption")).isEqualTo("올드빅과 Dub.+에 다녀왔어요"),
                () -> assertThat(media.get("thumbnail_key")).isEqualTo(THUMBNAIL_KEY),
                () -> assertThat(media.get("author")).isEqualTo("yeogidam"),
                () -> assertThat(media.get("failure_reason")).isNull(),
                () -> assertThat(count("places")).isEqualTo(2),
                () -> assertThat(count("media_places")).isEqualTo(2),
                () -> assertThat(count("saved_places")).isEqualTo(2),
                () -> assertThat(count("shared_media_saved_places")).isEqualTo(2)
        );
    }

    @Test
    void 여러_장소_중_일부만_지도에서_확인되면_확인된_장소만_보관함에_저장한다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of(hint("올드빅"), hint("Dub.+")));
        placeSearcher.add("올드빅", place("100", "올드빅"));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId(), "SUCCEEDED");

        // then
        assertThat(count("places")).isEqualTo(1);
        assertThat(count("media_places")).isEqualTo(1);
        assertThat(count("saved_places")).isEqualTo(1);
        assertThat(count("shared_media_saved_places")).isEqualTo(1);
    }

    @Test
    void 다른_미디어에서_같은_카카오_장소를_찾으면_장소_행을_재사용한다() throws Exception {
        // given
        placeSearcher.add("올드빅", place("100", "올드빅"));
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId(), "SUCCEEDED");

        // when
        shareService.createShare(MEMBER_ID,
                new ShareRequest("https://www.instagram.com/reel/pipeline-2026-two/"));
        Long secondMediaId = jdbcTemplate.queryForObject(
                "SELECT id FROM media WHERE media_shortcode = ?", Long.class, "pipeline-2026-two");
        awaitStatus(secondMediaId, "SUCCEEDED");

        // then
        assertThat(count("places")).isEqualTo(1);
        assertThat(count("media_places")).isEqualTo(2);
        assertThat(count("saved_places")).isEqualTo(1);
        assertThat(count("shared_media_saved_places")).isEqualTo(2);
    }

    @Test
    void Gemini_요청이_실패한_미디어는_파이프라인_버전_변경_후_재공유하면_다시_추출한다() throws Exception {
        // given
        placeNameExtractor.failWith(new ExtractionFailedException(
                ExtractionFailureReason.PROCESSING_FAILED, new IllegalStateException("Gemini 503")));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        Long mediaId = mediaId();
        awaitStatus(mediaId, "FAILED");

        // then
        assertThat(jdbcTemplate.queryForObject(
                "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId))
                .isEqualTo("PROCESSING_FAILED");
        Map<String, Object> sharedMedia = jdbcTemplate.queryForMap("""
                SELECT extraction_status, failure_reason
                FROM shared_media
                WHERE media_id = ?
                """, mediaId);
        assertAll(
                () -> assertThat(sharedMedia.get("extraction_status")).isEqualTo("FAILED"),
                () -> assertThat(sharedMedia.get("failure_reason")).isEqualTo("PROCESSING_FAILED")
        );
        assertThat(count("places")).isZero();
        assertThat(count("saved_places")).isZero();
        assertThat(count("shared_media_saved_places")).isZero();

        // when: 파이프라인 버전이 오른 뒤 실패한 미디어를 다시 공유한다.
        jdbcTemplate.update("UPDATE media SET extraction_version = ? WHERE id = ?",
                extractionProperties.pipelineVersion() - 1, mediaId);
        placeNameExtractor.failWith(null);
        placeSearcher.add("올드빅", place("100", "올드빅"));
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId, "SUCCEEDED");

        // then: 가장 최근 공유 건을 보관함 장소와 연결한다.
        assertThat(placeNameExtractor.requestCount()).isEqualTo(2);
        assertThat(count("places")).isEqualTo(1);
        assertThat(count("media_places")).isEqualTo(1);
        assertThat(jdbcTemplate.queryForList(
                "SELECT shared_media_id FROM shared_media_saved_places", Long.class))
                .containsExactly(latestSharedMediaId());
    }

    @Test
    void 성공한_미디어를_재공유하면_추출을_반복하지_않고_새_공유를_보관함에_연결한다() throws Exception {
        // given
        placeSearcher.add("올드빅", place("100", "올드빅"));
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId(), "SUCCEEDED");
        Long previousSharedMediaId = latestSharedMediaId();

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));

        // then
        assertThat(placeNameExtractor.requestCount()).isEqualTo(1);
        assertThat(count("places")).isEqualTo(1);
        assertThat(count("media_places")).isEqualTo(1);
        assertThat(jdbcTemplate.queryForList(
                "SELECT shared_media_id FROM shared_media_saved_places ORDER BY shared_media_id", Long.class))
                .containsExactly(previousSharedMediaId, latestSharedMediaId());
    }

    @Test
    void 추출_중에_재공유하면_가장_최근_공유에_장소를_연결한다() throws Exception {
        // given
        placeSearcher.add("올드빅", place("100", "올드빅"));
        placeNameExtractor.block();

        try {
            // when
            shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
            assertThat(placeNameExtractor.awaitStarted()).isTrue();
            Long previousSharedMediaId = latestSharedMediaId();
            shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));

            // then: 추출을 기다리던 첫 공유 건에는 저장 연결이 아직 없다.
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM shared_media_saved_places WHERE shared_media_id = ?",
                    Integer.class, previousSharedMediaId)).isZero();
        } finally {
            placeNameExtractor.allow();
        }
        awaitStatus(mediaId(), "SUCCEEDED");
        assertThat(placeNameExtractor.requestCount()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForList(
                "SELECT shared_media_id FROM shared_media_saved_places", Long.class))
                .containsExactly(latestSharedMediaId());
    }

    @Test
    void 결과_저장_중_실패하면_장소_관련_행은_모두_롤백하고_실패로_기록한다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of(hint("올드빅"), hint("두 번째 장소")));
        placeSearcher.add("올드빅", place("100", "올드빅"));
        placeSearcher.add("두 번째 장소", place("200", "가".repeat(300)));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        Long mediaId = mediaId();
        awaitStatus(mediaId, "FAILED");

        // then
        assertThat(count("places")).isZero();
        assertThat(count("media_places")).isZero();
        assertThat(count("saved_places")).isZero();
        assertThat(count("shared_media_saved_places")).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT caption FROM media WHERE id = ?", String.class, mediaId))
                .isEqualTo("올드빅과 Dub.+에 다녀왔어요");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId))
                .isEqualTo("UNEXPECTED");
    }

    @Test
    void Gemini가_장소를_찾지_못하면_PLACE_NOT_EXTRACTED로_기록한다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of());

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        Long mediaId = mediaId();
        awaitStatus(mediaId, "FAILED");

        // then
        assertThat(jdbcTemplate.queryForObject(
                "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId))
                .isEqualTo("PLACE_NOT_EXTRACTED");
        assertThat(count("places")).isZero();
    }

    @Test
    void 카카오에서_장소를_확인하지_못하면_PLACE_NOT_MATCHED로_기록한다() throws Exception {
        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        Long mediaId = mediaId();
        awaitStatus(mediaId, "FAILED");

        // then
        assertThat(jdbcTemplate.queryForObject(
                "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId))
                .isEqualTo("PLACE_NOT_MATCHED");
        assertThat(count("places")).isZero();
    }

    private Long mediaId() {
        return jdbcTemplate.queryForObject("SELECT id FROM media WHERE media_shortcode = ?",
                Long.class, "pipeline-2026");
    }

    private Long latestSharedMediaId() {
        return jdbcTemplate.queryForObject("SELECT MAX(id) FROM shared_media WHERE media_id = ?",
                Long.class, mediaId());
    }

    private int count(String table) {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private void awaitStatus(Long mediaId, String expected) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < deadline) {
            if (expected.equals(jdbcTemplate.queryForObject(
                    "SELECT extraction_status FROM media WHERE id = ?", String.class, mediaId))) {
                return;
            }
            Thread.sleep(10);
        }
        assertThat(jdbcTemplate.queryForObject(
                "SELECT extraction_status FROM media WHERE id = ?", String.class, mediaId)).isEqualTo(expected);
    }

    private static PlaceSearchHint hint(String name) {
        return new PlaceSearchHint(name, null, List.of(), List.of(), null);
    }

    private static Place place(String kakaoId, String name) {
        return new Place(null, new PlaceExternalSource(kakaoId, "https://place.map.kakao.com/" + kakaoId),
                new PlaceProfile(new PlaceName(name), new Address("서울 용산구 용산동2가 1", null),
                        new Coordinate(new BigDecimal("37.5"), new BigDecimal("127.0")),
                        "술집", null, new PlaceThumbnail(null, null)));
    }
}
