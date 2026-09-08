package com.yeogidam.place.repository;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class PlaceDao {

    private static final RowMapper<PlaceRecord> PLACE_ROW_MAPPER = (resultSet, rowNumber) -> new PlaceRecord(
            resultSet.getLong("id"),
            resultSet.getLong("reel_id"),
            resultSet.getString("name"),
            resultSet.getString("category"),
            resultSet.getString("address"),
            resultSet.getString("road_address"),
            resultSet.getBigDecimal("latitude"),
            resultSet.getBigDecimal("longitude"),
            resultSet.getString("kakao_place_id"),
            resultSet.getString("kakao_place_url"),
            resultSet.getString("telephone"),
            resultSet.getString("thumbnail_url"),
            resultSet.getString("thumbnail_source"),
            resultSet.getString("photo_attribution"),
            resultSet.getBoolean("saved"));

    private static final RowMapper<SavedPlaceRecord> SAVED_PLACE_ROW_MAPPER = (resultSet, rowNumber) ->
            new SavedPlaceRecord(
                    resultSet.getLong("id"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("address"),
                    resultSet.getString("road_address"),
                    resultSet.getBigDecimal("latitude"),
                    resultSet.getBigDecimal("longitude"),
                    resultSet.getString("kakao_place_url"),
                    resultSet.getString("telephone"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getInt("reel_count"));

    private final JdbcTemplate jdbcTemplate;

    public PlaceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Long insert(PlaceRecord placeRecord) {
        String sql = """
                INSERT INTO place (reel_id, name, category, address, road_address, latitude, longitude,
                                   kakao_place_id, kakao_place_url, telephone,
                                   thumbnail_url, thumbnail_source, photo_attribution, saved)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(
                connection -> prepareInsert(connection.prepareStatement(sql, new String[]{"id"}), placeRecord),
                keyHolder);
        return Objects.requireNonNull(keyHolder.getKey()).longValue();
    }

    private PreparedStatement prepareInsert(
            PreparedStatement statement,
            PlaceRecord placeRecord
    ) throws SQLException {
        statement.setLong(1, placeRecord.reelId());
        statement.setString(2, placeRecord.name());
        statement.setString(3, placeRecord.category());
        statement.setString(4, placeRecord.address());
        statement.setString(5, placeRecord.roadAddress());
        statement.setBigDecimal(6, placeRecord.latitude());
        statement.setBigDecimal(7, placeRecord.longitude());
        statement.setString(8, placeRecord.kakaoPlaceId());
        statement.setString(9, placeRecord.kakaoPlaceUrl());
        statement.setString(10, placeRecord.telephone());
        statement.setString(11, placeRecord.thumbnailUrl());
        statement.setString(12, placeRecord.thumbnailSource());
        statement.setString(13, placeRecord.photoAttribution());
        statement.setBoolean(14, placeRecord.saved());
        return statement;
    }

    public List<PlaceRecord> findAllByReelId(Long reelId) {
        String sql = "SELECT * FROM place WHERE reel_id = ? ORDER BY id";
        return jdbcTemplate.query(sql, PLACE_ROW_MAPPER, reelId);
    }

    public Optional<PlaceRecord> findById(Long placeId) {
        String sql = "SELECT * FROM place WHERE id = ?";
        return jdbcTemplate.query(sql, PLACE_ROW_MAPPER, placeId).stream()
                .findFirst();
    }

    public List<SavedPlaceRecord> findAllSaved() {
        String sql = """
                SELECT MIN(id) AS id, name, latitude, longitude,
                       MIN(category) AS category, MIN(address) AS address, MIN(road_address) AS road_address,
                       MIN(kakao_place_url) AS kakao_place_url, MIN(telephone) AS telephone,
                       MIN(thumbnail_url) AS thumbnail_url, COUNT(DISTINCT reel_id) AS reel_count
                FROM place
                WHERE saved = TRUE
                GROUP BY name, latitude, longitude
                ORDER BY MIN(id)
                """;
        return jdbcTemplate.query(sql, SAVED_PLACE_ROW_MAPPER);
    }

    public void markSaved(List<Long> placeIds) {
        String sql = "UPDATE place SET saved = TRUE WHERE id = ?";
        List<Object[]> arguments = placeIds.stream()
                .map(placeId -> new Object[]{placeId})
                .toList();
        jdbcTemplate.batchUpdate(sql, arguments);
    }

    public int unsaveSamePlace(Long placeId) {
        String sql = """
                UPDATE place SET saved = FALSE
                WHERE saved = TRUE
                  AND (name, latitude, longitude) = (
                      SELECT anchor.name, anchor.latitude, anchor.longitude
                      FROM (SELECT name, latitude, longitude FROM place WHERE id = ?) AS anchor)
                """;
        return jdbcTemplate.update(sql, placeId);
    }

    public void deleteAllByReelId(Long reelId) {
        String sql = "DELETE FROM place WHERE reel_id = ?";
        jdbcTemplate.update(sql, reelId);
    }
}
