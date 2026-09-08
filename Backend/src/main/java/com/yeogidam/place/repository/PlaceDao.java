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
            resultSet.getString("kakao_place_id"),
            resultSet.getString("name"),
            resultSet.getString("category"),
            resultSet.getString("address"),
            resultSet.getString("road_address"),
            resultSet.getBigDecimal("latitude"),
            resultSet.getBigDecimal("longitude"),
            resultSet.getString("kakao_place_url"),
            resultSet.getString("telephone"),
            resultSet.getString("thumbnail_url"),
            resultSet.getString("thumbnail_source"),
            resultSet.getString("photo_attribution"));

    private static final RowMapper<PlaceDecisionView> DECISION_VIEW_ROW_MAPPER = (resultSet, rowNumber) ->
            new PlaceDecisionView(
                    resultSet.getLong("place_id"),
                    resultSet.getString("kakao_place_id"),
                    resultSet.getString("name"),
                    resultSet.getString("category"),
                    resultSet.getString("address"),
                    resultSet.getString("road_address"),
                    resultSet.getBigDecimal("latitude"),
                    resultSet.getBigDecimal("longitude"),
                    resultSet.getString("kakao_place_url"),
                    resultSet.getString("telephone"),
                    resultSet.getString("thumbnail_url"),
                    resultSet.getString("decision_status"));

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
                    resultSet.getInt("media_count"));

    private final JdbcTemplate jdbcTemplate;

    public PlaceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Long insert(PlaceRecord placeRecord) {
        String sql = """
                INSERT INTO place (kakao_place_id, name, category, address, road_address, latitude, longitude,
                                   kakao_place_url, telephone, thumbnail_url, thumbnail_source, photo_attribution)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        bindIdentityAndAddress(statement, placeRecord);
        bindContactAndThumbnail(statement, placeRecord);
        return statement;
    }

    private void bindIdentityAndAddress(
            PreparedStatement statement,
            PlaceRecord placeRecord
    ) throws SQLException {
        statement.setString(1, placeRecord.kakaoPlaceId());
        statement.setString(2, placeRecord.name());
        statement.setString(3, placeRecord.category());
        statement.setString(4, placeRecord.address());
        statement.setString(5, placeRecord.roadAddress());
        statement.setBigDecimal(6, placeRecord.latitude());
        statement.setBigDecimal(7, placeRecord.longitude());
    }

    private void bindContactAndThumbnail(
            PreparedStatement statement,
            PlaceRecord placeRecord
    ) throws SQLException {
        statement.setString(8, placeRecord.kakaoPlaceUrl());
        statement.setString(9, placeRecord.telephone());
        statement.setString(10, placeRecord.thumbnailUrl());
        statement.setString(11, placeRecord.thumbnailSource());
        statement.setString(12, placeRecord.photoAttribution());
    }

    public Optional<PlaceRecord> findByKakaoPlaceId(String kakaoPlaceId) {
        String sql = "SELECT * FROM place WHERE kakao_place_id = ?";
        return jdbcTemplate.query(sql, PLACE_ROW_MAPPER, kakaoPlaceId).stream()
                .findFirst();
    }

    public Optional<PlaceRecord> findById(Long placeId) {
        String sql = "SELECT * FROM place WHERE id = ?";
        return jdbcTemplate.query(sql, PLACE_ROW_MAPPER, placeId).stream()
                .findFirst();
    }

    public List<PlaceDecisionView> findAllByShareId(Long shareId) {
        String sql = """
                SELECT p.id AS place_id, p.kakao_place_id, p.name, p.category, p.address, p.road_address,
                       p.latitude, p.longitude, p.kakao_place_url, p.telephone, p.thumbnail_url,
                       sp.decision_status
                FROM share_place AS sp
                INNER JOIN place AS p
                  ON p.id = sp.place_id
                WHERE sp.share_id = ?
                ORDER BY sp.position
                """;
        return jdbcTemplate.query(sql, DECISION_VIEW_ROW_MAPPER, shareId);
    }

    public List<PlaceDecisionView> findAllFactsByMediaId(Long mediaId) {
        String sql = """
                SELECT p.id AS place_id, p.kakao_place_id, p.name, p.category, p.address, p.road_address,
                       p.latitude, p.longitude, p.kakao_place_url, p.telephone, p.thumbnail_url,
                       NULL AS decision_status
                FROM media_place AS mp
                INNER JOIN place AS p
                  ON p.id = mp.place_id
                WHERE mp.media_id = ?
                ORDER BY mp.position
                """;
        return jdbcTemplate.query(sql, DECISION_VIEW_ROW_MAPPER, mediaId);
    }

    public List<SavedPlaceRecord> findAllSavedByUserId(Long userId) {
        String sql = """
                SELECT p.id, p.name, p.category, p.address, p.road_address,
                       p.latitude, p.longitude, p.kakao_place_url, p.telephone, p.thumbnail_url,
                       COUNT(DISTINCT s.media_id) AS media_count
                FROM share_place AS sp
                INNER JOIN place AS p
                  ON p.id = sp.place_id
                INNER JOIN media_share AS s
                  ON s.id = sp.share_id
                WHERE s.user_id = ?
                  AND sp.decision_status = 'SAVED'
                GROUP BY p.id, p.name, p.category, p.address, p.road_address,
                         p.latitude, p.longitude, p.kakao_place_url, p.telephone, p.thumbnail_url
                ORDER BY p.id
                """;
        return jdbcTemplate.query(sql, SAVED_PLACE_ROW_MAPPER, userId);
    }
}
