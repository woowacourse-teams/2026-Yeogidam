package com.yeogidam.media.extraction.infrastructure;

import static com.yeogidam.support.fixture.sql.MediaSqlFixture.insertExtractingMedia;
import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.SharedMediaSqlFixture.insertSharedMedia;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.domain.ExtractedPlaces;
import com.yeogidam.media.extraction.domain.PlaceExtractionResult;
import com.yeogidam.media.extraction.service.MediaExtractionResultWriter;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadata;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaHtmlReader;
import com.yeogidam.media.instagram.service.InstagramMediaMetadataWriter;
import com.yeogidam.place.domain.Place;
import com.yeogidam.support.IntegrationTestSupport;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 실제 게시물의 첨부 분석, 카카오 검색, 테스트용 MySQL 저장을 검증한다.
 * 썸네일 다운로드와 S3 업로드는 수행하지 않는다. Gemini API 사용 비용이 발생한다.
 *
 * <p>Java 21과 Docker를 준비하고 GEMINI_API_KEY, GEMINI_MODEL, KAKAO_CLIENT_ID를 설정한다.
 * YEOGIDAM_GEMINI_SMOKE=true일 때만 실행한다. IDE에서는 이 클래스의 테스트를 실행한다.
 * Gradle에서는 --tests '*GeminiMediaExtractionLiveTest' --rerun-tasks로 실행한다.
 *
 * ```
 * cd Backend
 * YEOGIDAM_GEMINI_SMOKE=true ./gradlew test \
 *   --tests '*GeminiMediaExtractionLiveTest' \
 *   --rerun-tasks --info
 * ```
 */
@EnabledIfEnvironmentVariable(named = "YEOGIDAM_GEMINI_SMOKE", matches = "true")
class GeminiMediaExtractionLiveTest extends IntegrationTestSupport {

    private static final Long MEMBER_ID = 1L;
    private static final Long MEDIA_ID = 1L;
    private static final Long SHARE_ID = 1L;
    private static final String POST_URL = "https://www.instagram.com/p/DdiyEBfp_iL/";
    private static final List<String> EXPECTED_NAMES = List.of("빠넬로", "담택본점", "사카바주정", "서교동진향", "돈토키");

    @Autowired
    private InstagramMediaHtmlReader metadataReader;

    @Autowired
    private InstagramMediaMetadataWriter metadataWriter;

    @Autowired
    private GeminiPlaceNameExtractor extractor;

    @Autowired
    private KakaoPlaceSearcher searcher;

    @Autowired
    private MediaExtractionResultWriter resultWriter;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void 실제_게시물의_다섯_장소를_카카오에서_찾아_상세정보와_보관함에_저장한다() {
        // given
        InstagramUrl url = new InstagramUrl(POST_URL);
        insertKakaoMember(jdbcTemplate, MEMBER_ID, "live-user", "live-user", "live@example.com", null);
        insertExtractingMedia(jdbcTemplate, MEDIA_ID);
        jdbcTemplate.update("UPDATE media SET media_shortcode = ? WHERE id = ?", url.getMediaShortcode().value(), MEDIA_ID);
        insertSharedMedia(jdbcTemplate, SHARE_ID, MEMBER_ID, MEDIA_ID, POST_URL, Instant.now());
        var metadata = metadataReader.read(url);
        metadataWriter.updateMetadata(MEDIA_ID, new MediaMetadata(metadata.caption(), null, metadata.author()));

        // when
        var hints = extractor.extractFile(metadata.caption(), url);
        List<Place> places = hints.places()
                .stream()
                .flatMap(hint -> searcher.search(hint).stream())
                .toList();
        resultWriter.recordSuccess(MEDIA_ID, new PlaceExtractionResult(new ExtractedPlaces(places)));

        // then
        assertAll(
                () -> assertThat(places).extracting(place -> normalizedName(place.profile().name().value()))
                        .containsExactlyInAnyOrderElementsOf(EXPECTED_NAMES),
                () -> assertThat(places).extracting(place -> place.externalSource().placeId()).doesNotHaveDuplicates(),
                () -> assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM places", Integer.class)).isEqualTo(5),
                () -> assertAll(places.stream().<Executable>map(place -> () -> assertStoredPlace(place))),
                () -> assertStoredLinks(places),
                () -> assertExtractionState("media", MEDIA_ID),
                () -> assertExtractionState("shared_media", SHARE_ID)
        );
    }

    private String normalizedName(String name) {
        return name.replaceAll("\\s+", "");
    }

    private void assertStoredPlace(Place place) {
        Map<String, Object> row = jdbcTemplate.queryForMap("""
                SELECT id, kakao_place_id, name, category, land_lot_address, road_address,
                       latitude, longitude, kakao_place_url, telephone, created_at
                FROM places WHERE kakao_place_id = ?
                """, place.externalSource().placeId());
        var profile = place.profile();
        assertAll(
                () -> assertThat(((Number) row.get("id")).longValue()).isPositive(),
                () -> assertThat(row.get("kakao_place_id")).isEqualTo(place.externalSource().placeId()),
                () -> assertThat(row.get("name")).isEqualTo(profile.name().value()),
                () -> assertThat(row.get("category")).isEqualTo(profile.category()),
                () -> assertThat(row.get("land_lot_address")).isEqualTo(profile.address().landLotAddress()),
                () -> assertThat(row.get("road_address")).isEqualTo(profile.address().roadAddress()),
                () -> assertThat((BigDecimal) row.get("latitude"))
                        .isEqualByComparingTo(profile.coordinate().latitude().setScale(10, RoundingMode.HALF_UP)),
                () -> assertThat((BigDecimal) row.get("longitude"))
                        .isEqualByComparingTo(profile.coordinate().longitude().setScale(10, RoundingMode.HALF_UP)),
                () -> assertThat(row.get("kakao_place_url")).isEqualTo(place.externalSource().placeUrl()),
                () -> assertThat(row.get("telephone")).isEqualTo(profile.telephone()),
                () -> assertThat(row.get("created_at")).isNotNull()
        );
    }

    private void assertStoredLinks(List<Place> places) {
        List<String> expectedIds = places.stream().map(place -> place.externalSource().placeId()).toList();
        assertAll(
                () -> assertThat(jdbcTemplate.queryForList("""
                        SELECT p.kakao_place_id FROM media_places mp JOIN places p ON p.id = mp.place_id
                        WHERE mp.media_id = ?
                        """, String.class, MEDIA_ID)).containsExactlyInAnyOrderElementsOf(expectedIds),
                () -> assertThat(jdbcTemplate.queryForList("""
                        SELECT p.kakao_place_id FROM saved_places sp JOIN places p ON p.id = sp.place_id
                        WHERE sp.member_id = ?
                        """, String.class, MEMBER_ID)).containsExactlyInAnyOrderElementsOf(expectedIds),
                () -> assertThat(jdbcTemplate.queryForList("""
                        SELECT p.kakao_place_id FROM shared_media_saved_places smsp
                        JOIN saved_places sp ON sp.id = smsp.saved_place_id JOIN places p ON p.id = sp.place_id
                        WHERE smsp.shared_media_id = ? AND sp.member_id = ?
                        """, String.class, SHARE_ID, MEMBER_ID)).containsExactlyInAnyOrderElementsOf(expectedIds),
                () -> assertThat(jdbcTemplate.queryForObject("""
                        SELECT COUNT(*) FROM saved_places WHERE member_id = ? AND last_saved_at IS NOT NULL
                        """, Integer.class, MEMBER_ID)).isEqualTo(5),
                () -> assertThat(jdbcTemplate.queryForObject("""
                        SELECT COUNT(*) FROM shared_media_saved_places WHERE shared_media_id = ? AND created_at IS NOT NULL
                        """, Integer.class, SHARE_ID)).isEqualTo(5)
        );
    }

    private void assertExtractionState(String table, Long id) {
        Map<String, Object> row = jdbcTemplate.queryForMap(
                "SELECT extraction_status, failure_reason, extraction_version FROM " + table + " WHERE id = ?", id);
        assertAll(
                () -> assertThat(row.get("extraction_status")).isEqualTo("SUCCEEDED"),
                () -> assertThat(row.get("failure_reason")).isNull(),
                () -> assertThat(((Number) row.get("extraction_version")).intValue()).isEqualTo(1)
        );
    }
}
