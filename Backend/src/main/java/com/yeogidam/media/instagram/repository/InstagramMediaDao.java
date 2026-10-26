package com.yeogidam.media.instagram.repository;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.domain.MediaSourceType;
import com.yeogidam.media.instagram.domain.InstagramMedia;
import com.yeogidam.media.instagram.domain.MediaMetadata;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class InstagramMediaDao {

    private static final RowMapper<Long> ID_ROW_MAPPER = (resultSet, rowNumber)
            -> resultSet.getLong("id");

    private static final RowMapper<ExtractionSnapshot> EXTRACTION_SNAPSHOT_ROW_MAPPER = (resultSet, rowNumber) ->
            new ExtractionSnapshot(
                    ExtractionStatus.valueOf(resultSet.getString("extraction_status")),
                    failureReason(resultSet),
                    resultSet.getInt("extraction_version"),
                    MediaSourceType.valueOf(resultSet.getString("source_type"))
            );

    private static ExtractionFailureReason failureReason(ResultSet resultSet) throws SQLException {
        String reason = resultSet.getString("failure_reason");
        if (reason == null) {
            return null;
        }
        return ExtractionFailureReason.valueOf(reason);
    }

    private final JdbcTemplate jdbcTemplate;

    public MediaSaveProjection saveIfAbsent(InstagramMedia instagramMedia, int pipelineVersion) {
        Optional<Long> createdMediaId = insertIfAbsent(instagramMedia, pipelineVersion);
        if (createdMediaId.isPresent()) {
            return new MediaSaveProjection(createdMediaId.orElseThrow(), true);
        }
        Long mediaId = findIdByShortcodeForUpdate(new MediaShortcode(instagramMedia.getShortcode()))
                .orElseThrow(() -> new IllegalStateException("저장된 게시물을 찾을 수 없습니다."));
        return new MediaSaveProjection(mediaId, false);
    }

    private Optional<Long> insertIfAbsent(InstagramMedia instagramMedia, int pipelineVersion) {
        String sql = """
                INSERT INTO media (
                    media_shortcode, caption, thumbnail_key, author,
                    extraction_status, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE id = id
                """;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            bindInsertParameters(statement, instagramMedia, pipelineVersion);
            return statement;
        }, keyHolder);
        // id = id 중복 분기는 생성 키가 없다.
        return Optional.ofNullable(keyHolder.getKey())
                .map(Number::longValue);
    }

    private void bindInsertParameters(
            PreparedStatement statement,
            InstagramMedia instagramMedia,
            int pipelineVersion
    ) throws SQLException {
        statement.setString(1, instagramMedia.getShortcode());
        statement.setString(2, instagramMedia.metadata().caption());
        statement.setString(3, instagramMedia.metadata().thumbnailKey());
        statement.setString(4, instagramMedia.metadata().author());
        statement.setString(5, instagramMedia.extraction().status().name());
        statement.setInt(6, pipelineVersion);
        statement.setString(7, MediaSourceType.EXTRACTED.name());
    }

    private Optional<Long> findIdByShortcodeForUpdate(MediaShortcode shortcode) {
        String sql = """
                SELECT id
                FROM media
                WHERE media_shortcode = ?
                FOR UPDATE
                """;
        return jdbcTemplate.query(sql, ID_ROW_MAPPER, shortcode.value())
                .stream()
                .findFirst();
    }

    public void updateMetadata(Long mediaId, MediaMetadata metadata) {
        String sql = """
                UPDATE media
                SET caption = ?, thumbnail_key = ?, author = ?
                WHERE id = ?
                """;
        jdbcTemplate.update(sql, metadata.caption(), metadata.thumbnailKey(), metadata.author(), mediaId);
    }

    public boolean failExtractionIfInProgress(Long mediaId, ExtractionFailureReason failureReason) {
        String sql = """
                UPDATE media
                SET extraction_status = 'FAILED', failure_reason = ?
                WHERE id = ? AND extraction_status = 'EXTRACTING'
                """;
        return jdbcTemplate.update(sql, failureReason.name(), mediaId) == 1;
    }

    public ExtractionSnapshot findExtractionSnapshotForUpdate(Long mediaId) {
        String sql = """
                SELECT extraction_status, failure_reason, extraction_version, source_type
                FROM media
                WHERE id = ?
                FOR UPDATE
                """;
        return jdbcTemplate.queryForObject(sql, EXTRACTION_SNAPSHOT_ROW_MAPPER, mediaId);
    }

    public boolean succeedExtractionIfInProgress(Long mediaId) {
        String sql = """
                UPDATE media
                SET extraction_status = 'SUCCEEDED', failure_reason = NULL
                WHERE id = ? AND extraction_status = 'EXTRACTING'
                """;
        return jdbcTemplate.update(sql, mediaId) == 1;
    }

    /**
     * 같은 트랜잭션에서 게시물 행을 잠그고 재시도 가능 여부를 확인한 뒤 호출한다.
     */
    public void updateExtractionForRetry(Long mediaId, int pipelineVersion) {
        String sql = """
                UPDATE media
                SET extraction_status = 'EXTRACTING',
                    failure_reason = NULL,
                    extraction_version = ?
                WHERE id = ?
                """;
        jdbcTemplate.update(sql, pipelineVersion, mediaId);
    }

    public Optional<Long> findIdByShortcode(MediaShortcode shortcode) {
        String sql = """
                SELECT id
                FROM media
                WHERE media_shortcode = ?
                """;
        return jdbcTemplate.query(sql, ID_ROW_MAPPER, shortcode.value())
                .stream()
                .findFirst();
    }
}
