package com.yeogidam.place.repository;

import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceThumbnail;
import com.yeogidam.place.repository.PlaceInfoProjection.Menu;
import com.yeogidam.place.repository.PlaceInfoProjection.OpeningDay;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.function.UnaryOperator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.stereotype.Repository;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

@Slf4j
@Repository
public class PlaceDao {

    private static final RowMapper<Long> PLACE_ID_ROW_MAPPER = (resultSet, rowNumber) ->
            resultSet.getLong("id");

    private static final RowMapper<PlaceMediaProjection> MEDIA_PROJECTION_ROW_MAPPER = (resultSet, rowNumber) ->
            new PlaceMediaProjection(
                    resultSet.getLong("shared_media_id"),
                    resultSet.getString("thumbnail_key"),
                    resultSet.getString("author"),
                    resultSet.getString("caption"),
                    resultSet.getString("shared_url"),
                    resultSet.getTimestamp("created_at").toInstant()
            );

    private final JdbcTemplate jdbcTemplate;
    private final SimpleJdbcInsert jdbcInsert;
    private final JsonMapper jsonMapper;

    public PlaceDao(JdbcTemplate jdbcTemplate, JsonMapper jsonMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.jsonMapper = jsonMapper;
        this.jdbcInsert = new SimpleJdbcInsert(jdbcTemplate)
                .withTableName("places")
                .usingColumns(
                        "kakao_place_id",
                        "name",
                        "category",
                        "land_lot_address",
                        "road_address",
                        "latitude",
                        "longitude",
                        "kakao_place_url",
                        "telephone",
                        "thumbnail_key",
                        "thumbnail_source"
                )
                .usingGeneratedKeyColumns("id");
    }

    public Long saveIfAbsent(Place place) {
        String kakaoPlaceId = place.externalSource().placeId();
        Optional<Long> existingId = findIdByKakaoPlaceId(kakaoPlaceId);
        if (existingId.isPresent()) {
            Long placeId = existingId.orElseThrow();
            updateThumbnailIfAbsent(placeId, place.profile().thumbnail());
            return placeId;
        }
        return insertOrFindExisting(place, kakaoPlaceId);
    }

    private Optional<Long> findIdByKakaoPlaceId(String kakaoPlaceId) {
        String sql = """
                SELECT id
                FROM places
                WHERE kakao_place_id = ?
                """;
        return jdbcTemplate.query(sql, PLACE_ID_ROW_MAPPER, kakaoPlaceId)
                .stream()
                .findFirst();
    }

    private void updateThumbnailIfAbsent(Long placeId, PlaceThumbnail thumbnail) {
        if (thumbnail == null || thumbnail.key() == null || thumbnail.key().isBlank()) {
            return;
        }
        String sql = """
                UPDATE places
                SET thumbnail_key = ?, thumbnail_source = ?
                WHERE id = ?
                  AND (thumbnail_key IS NULL OR thumbnail_key = '')
                """;
        jdbcTemplate.update(sql, thumbnail.key(), thumbnail.source(), placeId);
    }

    private Long insertOrFindExisting(Place place, String kakaoPlaceId) {
        try {
            return insert(place);
        } catch (DuplicateKeyException exception) {
            Long placeId = findIdByKakaoPlaceIdForUpdate(kakaoPlaceId).orElseThrow(() -> exception);
            updateThumbnailIfAbsent(placeId, place.profile().thumbnail());
            return placeId;
        }
    }

    private Long insert(Place place) {
        PlaceThumbnail thumbnail = Objects.requireNonNullElse(place.profile().thumbnail(),
                new PlaceThumbnail(null, null));
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("kakao_place_id", place.externalSource().placeId())
                .addValue("name", place.profile().name().value())
                .addValue("category", place.profile().category())
                .addValue("land_lot_address", place.profile().address().landLotAddress())
                .addValue("road_address", place.profile().address().roadAddress())
                .addValue("latitude", place.profile().coordinate().latitude())
                .addValue("longitude", place.profile().coordinate().longitude())
                .addValue("kakao_place_url", place.externalSource().placeUrl())
                .addValue("telephone", place.profile().telephone())
                .addValue("thumbnail_key", thumbnail.key())
                .addValue("thumbnail_source", thumbnail.source());
        return jdbcInsert.executeAndReturnKey(parameters).longValue();
    }

    public Optional<PlaceThumbnail> findThumbnailByKakaoPlaceId(String kakaoPlaceId) {
        String sql = """
                SELECT thumbnail_key, thumbnail_source
                FROM places
                WHERE kakao_place_id = ?
                """;
        return jdbcTemplate.query(sql, (resultSet, rowNumber) -> new PlaceThumbnail(
                resultSet.getString("thumbnail_key"),
                resultSet.getString("thumbnail_source")), kakaoPlaceId)
                .stream()
                .findFirst();
    }

    /**
     * 장소 상세의 영업시간과 메뉴로, 영업시간과 메뉴는 회원마다 다르지 않은 장소 정보라서 장소 ID로만 읽는다.
     * 형식이 올바르지 않은 컬럼은 해당 컬럼만 정보 없음(null)으로 읽고 다른 컬럼은 그대로 읽는다.
     */
    public Optional<PlaceInfoProjection> findInfoById(Long placeId) {
        String sql = """
                SELECT opening_hours, menus
                FROM places
                WHERE id = ?
                """;
        return jdbcTemplate.query(sql, (resultSet, rowNumber) -> new PlaceInfoProjection(
                        readInfoList(placeId, resultSet.getString("opening_hours"), OpeningDay.class,
                                OpeningDay::inWeekOrder),
                        readInfoList(placeId, resultSet.getString("menus"), Menu.class, UnaryOperator.identity())
                ), placeId)
                .stream()
                .findFirst();
    }

    private <T> List<T> readInfoList(
            Long placeId,
            String json,
            Class<T> itemType,
            UnaryOperator<List<T>> normalizer
    ) {
        if (json == null) {
            return null;
        }
        try {
            List<T> items = jsonMapper.readerForListOf(itemType)
                    .without(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                    .readValue(json);
            if (items == null) {
                return null;
            }
            if (items.stream().anyMatch(Objects::isNull)) {
                throw new IllegalArgumentException("장소 정보 목록에 null 항목이 있습니다.");
            }
            return normalizer.apply(items);
        } catch (JacksonException | IllegalArgumentException exception) {
            log.warn("장소 정보 JSON 형식이 올바르지 않습니다. placeId={}, itemType={}, reason={}",
                    placeId, itemType.getSimpleName(), exception.getMessage());
            return null;
        }
    }

    /**
     * 장소 상세 목록에 보여 줄 공유로, 해당 장소가 추출된 게시물의 내 공유를 게시물마다 가장 최근 한 건씩 최신순으로 읽는다.
     * 지우지 않았고 분석에 성공한 내 공유만 읽으며, 보관함에 장소를 저장했는지와 공유 연결은 보지 않는다.
     * 공유 시각이 같으면 ID가 큰 공유를 더 최근으로 본다.
     */
    public List<PlaceMediaProjection> findMediaByMemberAndPlace(Long memberId, Long placeId) {
        String sql = """
                SELECT latest.shared_media_id,
                       m.thumbnail_key,
                       m.author,
                       m.caption,
                       latest.shared_url,
                       latest.created_at
                FROM (
                    SELECT sm.id AS shared_media_id,
                           sm.media_id,
                           sm.created_at,
                           sm.shared_url,
                           ROW_NUMBER() OVER (
                               PARTITION BY sm.media_id
                               ORDER BY sm.created_at DESC, sm.id DESC
                           ) AS recency_rank
                    FROM shared_media sm
                    WHERE sm.member_id = ?
                      AND sm.deleted_at IS NULL
                      AND sm.extraction_status = 'SUCCEEDED'
                      AND EXISTS (
                          SELECT 1
                          FROM media_places mp
                          WHERE mp.media_id = sm.media_id
                            AND mp.place_id = ?
                      )
                ) latest
                JOIN media m ON m.id = latest.media_id
                WHERE latest.recency_rank = 1
                ORDER BY latest.created_at DESC, latest.shared_media_id DESC
                """;
        return jdbcTemplate.query(sql, MEDIA_PROJECTION_ROW_MAPPER, memberId, placeId);
    }

    private Optional<Long> findIdByKakaoPlaceIdForUpdate(String kakaoPlaceId) {
        String sql = """
                SELECT id
                FROM places
                WHERE kakao_place_id = ?
                FOR UPDATE
                """;
        return jdbcTemplate.query(sql, PLACE_ID_ROW_MAPPER, kakaoPlaceId)
                .stream()
                .findFirst();
    }
}
