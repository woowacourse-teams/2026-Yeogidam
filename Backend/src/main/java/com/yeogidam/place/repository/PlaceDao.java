package com.yeogidam.place.repository;

import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceThumbnail;
import java.util.Objects;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.stereotype.Repository;

@Repository
public class PlaceDao {

    private static final RowMapper<Long> PLACE_ID_ROW_MAPPER = (resultSet, rowNumber) ->
            resultSet.getLong("id");

    private final JdbcTemplate jdbcTemplate;
    private final SimpleJdbcInsert jdbcInsert;

    public PlaceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
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
