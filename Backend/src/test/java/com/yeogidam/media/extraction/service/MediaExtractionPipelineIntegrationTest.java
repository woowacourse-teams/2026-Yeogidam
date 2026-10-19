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
import com.yeogidam.support.fake.FakeMediaExtractionConfig.FakeInstagramMediaHtmlReader;
import com.yeogidam.support.fake.FakePlaceNameExtractor;
import com.yeogidam.support.fake.FakePlaceSearcher;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
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

    @Autowired
    private FakeInstagramMediaHtmlReader instagramMediaHtmlReader;

    @BeforeEach
    void setUp() {
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "pipeline-user", "pipeline-user",
                "pipeline-user@example.com", null);
        placeNameExtractor.reset();
        placeSearcher.reset();
        instagramMediaHtmlReader.respondWithAuthor("yeogidam");
    }

    @AfterEach
    void resetAuthor() {
        instagramMediaHtmlReader.respondWithAuthor("yeogidam");
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
                () -> assertThat(count("shared_media_saved_places")).isEqualTo(2),
                () -> assertThat(placeNameExtractor.mediaRequestCount()).isZero()
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
        assertThat(placeNameExtractor.mediaRequestCount()).isZero();

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
    void 캡션과_첨부_모두_검색용_장소가_없으면_지도를_조회하지_않고_미추출로_기록한다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of());
        placeNameExtractor.respondToMediaWith(List.of());

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        Long mediaId = mediaId();
        awaitStatus(mediaId, "FAILED");

        // then
        assertAll(
                () -> assertThat(jdbcTemplate.queryForObject(
                        "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId))
                        .isEqualTo("PLACE_NOT_EXTRACTED"),
                () -> assertThat(count("places")).isZero(),
                () -> assertThat(count("saved_places")).isZero(),
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(1),
                () -> assertThat(placeSearcher.requestCount()).isZero()
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"reel", "p"})
    void 캡션에_장소가_없으면_원본_미디어와_캡션으로_재분석하고_지도_장소를_저장한다(String path) throws Exception {
        // given
        String url = "https://www.instagram.com/" + path + "/pipeline-2026/";
        placeNameExtractor.respondWith(List.of());
        placeNameExtractor.respondToMediaWith(List.of(hint("올드빅"), hint("Dub.+")));
        placeSearcher.add("올드빅", place("100", "올드빅"));
        placeSearcher.add("Dub.+", place("200", "Dub.+"));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(url));
        awaitStatus(mediaId(), "SUCCEEDED");

        // then
        assertAll(
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.mediaCaption()).isEqualTo("올드빅과 Dub.+에 다녀왔어요"),
                () -> assertThat(placeNameExtractor.mediaUrl()).isEqualTo(url),
                () -> assertThat(count("saved_places")).isEqualTo(2)
        );
    }

    @Test
    void 미디어_추가_분석이_실패하면_PROCESSING_FAILED로_기록한다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of());
        placeNameExtractor.failMediaWith(new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId(), "FAILED");

        // then
        assertThat(jdbcTemplate.queryForObject(
                "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId()))
                .isEqualTo("PROCESSING_FAILED");
        assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(1);
        assertThat(count("places")).isZero();
        assertThat(placeSearcher.requestCount()).isZero();
    }

    @Test
    void 미디어로_찾은_장소를_재공유하면_다운로드와_추가_분석을_반복하지_않는다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of());
        placeNameExtractor.respondToMediaWith(List.of(hint("올드빅")));
        placeSearcher.add("올드빅", place("100", "올드빅"));
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId(), "SUCCEEDED");

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));

        // then
        assertAll(
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(1),
                () -> assertThat(count("places")).isEqualTo(1),
                () -> assertThat(count("shared_media_saved_places")).isEqualTo(2)
        );
    }

    @Test
    void 이전_버전에서_장소를_못_찾은_게시물을_재공유하면_미디어_재분석으로_복구한다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of());
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        Long mediaId = mediaId();
        awaitStatus(mediaId, "FAILED");
        jdbcTemplate.update("UPDATE media SET extraction_version = ? WHERE id = ?",
                extractionProperties.pipelineVersion() - 1, mediaId);
        placeNameExtractor.respondToMediaWith(List.of(hint("올드빅")));
        placeSearcher.add("올드빅", place("100", "올드빅"));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId, "SUCCEEDED");

        // then
        assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(2);
        assertThat(count("saved_places")).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT extraction_version FROM media WHERE id = ?", Integer.class, mediaId))
                .isEqualTo(extractionProperties.pipelineVersion());
    }

    @Test
    void 캡션_단서로_카카오에서_못_찾으면_첨부를_읽고_그래도_없으면_PLACE_NOT_MATCHED로_기록한다() throws Exception {
        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        Long mediaId = mediaId();
        awaitStatus(mediaId, "FAILED");

        // then
        assertThat(jdbcTemplate.queryForObject(
                "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId))
                .isEqualTo("PLACE_NOT_MATCHED");
        assertThat(count("places")).isZero();
        assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(1);
    }

    @Test
    void 캡션_단서로_카카오에서_못_찾으면_첨부에서_찾은_장소를_저장한다() throws Exception {
        // given
        placeNameExtractor.respondWith(List.of(hint("올드빅")));
        placeNameExtractor.respondToMediaWith(List.of(hint("Dub.+")));
        placeSearcher.add("Dub.+", place("200", "Dub.+"));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId(), "SUCCEEDED");

        // then
        assertAll(
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(1),
                () -> assertThat(count("saved_places")).isEqualTo(1)
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"reel", "p"})
    void 지정_작성자는_경로와_무관하게_캡션과_미디어를_한번에_분석하고_모든_장소를_저장한다(String path) throws Exception {
        // given
        String url = "https://www.instagram.com/" + path + "/pipeline-2026/";
        instagramMediaHtmlReader.respondWithAuthor("with_sol_mate");
        placeNameExtractor.respondWith(List.of(hint("올드빅")));
        placeNameExtractor.respondToMediaWith(List.of(hint("올드빅"), hint("Dub.+")));
        placeSearcher.add("올드빅", place("100", "올드빅"));
        placeSearcher.add("Dub.+", place("200", "Dub.+"));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(url));
        awaitStatus(mediaId(), "SUCCEEDED");

        // then
        assertAll(
                () -> assertThat(placeNameExtractor.requestCount()).isZero(),
                () -> assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.mediaCaption()).isEqualTo("올드빅과 Dub.+에 다녀왔어요"),
                () -> assertThat(placeNameExtractor.mediaUrl()).isEqualTo(url),
                () -> assertThat(count("saved_places")).isEqualTo(2)
        );
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"yeogidam", "with_sol_mate_other"})
    void 지정_작성자가_아니거나_작성자가_없으면_캡션_우선_분석을_유지한다(String author) throws Exception {
        // given
        instagramMediaHtmlReader.respondWithAuthor(author);
        placeSearcher.add("올드빅", place("100", "올드빅"));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId(), "SUCCEEDED");

        // then
        assertAll(
                () -> assertThat(placeNameExtractor.requestCount()).isEqualTo(1),
                () -> assertThat(placeNameExtractor.mediaRequestCount()).isZero(),
                () -> assertThat(count("saved_places")).isEqualTo(1)
        );
    }

    @Test
    void 지정_작성자의_미디어_분석이_실패하면_PROCESSING_FAILED로_기록한다() throws Exception {
        // given
        instagramMediaHtmlReader.respondWithAuthor("with_sol_mate");
        placeNameExtractor.failMediaWith(new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED));
        placeSearcher.add("올드빅", place("100", "올드빅"));

        // when
        shareService.createShare(MEMBER_ID, new ShareRequest(INSTAGRAM_URL));
        awaitStatus(mediaId(), "FAILED");

        // then
        assertAll(
                () -> assertThat(placeNameExtractor.requestCount()).isZero(),
                () -> assertThat(placeNameExtractor.mediaRequestCount()).isEqualTo(1),
                () -> assertThat(placeSearcher.requestCount()).isZero(),
                () -> assertThat(count("saved_places")).isZero(),
                () -> assertThat(jdbcTemplate.queryForObject(
                        "SELECT failure_reason FROM media WHERE id = ?", String.class, mediaId()))
                        .isEqualTo("PROCESSING_FAILED")
        );
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
