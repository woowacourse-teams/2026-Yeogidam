package com.yeogidam.media.instagram.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * media_place 행. "이 게시물에서 이 장소가 나왔다"는 추출 사실만 들고 결정은 모른다.
 * 사용자 결정은 share_place(공유 건에 발급된 후보)의 몫이다.
 */
@Repository
public class MediaPlaceDao {

    private final JdbcTemplate jdbcTemplate;

    public MediaPlaceDao(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(
            Long mediaId,
            Long placeId,
            int position
    ) {
        String sql = "INSERT INTO media_place (media_id, place_id, position) VALUES (?, ?, ?)";
        jdbcTemplate.update(sql, mediaId, placeId, position);
    }

    public void deleteAllByMediaId(Long mediaId) {
        String sql = "DELETE FROM media_place WHERE media_id = ?";
        jdbcTemplate.update(sql, mediaId);
    }
}
