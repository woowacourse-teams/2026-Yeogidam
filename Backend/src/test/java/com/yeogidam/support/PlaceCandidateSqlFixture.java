package com.yeogidam.support;

import java.sql.Timestamp;
import org.springframework.jdbc.core.JdbcTemplate;

public final class PlaceCandidateSqlFixture {

    private PlaceCandidateSqlFixture() {
    }

    public static void insertMember(
            JdbcTemplate jdbcTemplate,
            Long memberId,
            String providerUserId
    ) {
        jdbcTemplate.update("""
                INSERT INTO members (
                    id, oauth_provider, provider_user_id, nickname, email, image_url
                )
                VALUES (?, 'KAKAO', ?, ?, ?, ?)
                """, memberId, providerUserId, providerUserId,
                providerUserId + "@example.com", "https://img.example.com/" + providerUserId);
    }

    public static void insertMedia(
            JdbcTemplate jdbcTemplate,
            Long mediaId,
            String caption,
            String thumbnailUrl,
            String author
    ) {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_url, author,
                    extraction_status, extraction_version, source_type
                )
                VALUES (?, ?, ?, ?, ?, 'SUCCEEDED', 1, 'SEEDED')
                """, mediaId, "fixture-media-" + mediaId, caption, thumbnailUrl, author);
    }

    public static void insertSharedMedia(
            JdbcTemplate jdbcTemplate,
            Long sharedMediaId,
            Long memberId,
            Long mediaId,
            Timestamp createdAt
    ) {
        jdbcTemplate.update("""
                INSERT INTO shared_media (id, member_id, media_id, shared_url, created_at)
                VALUES (?, ?, ?, ?, ?)
                """, sharedMediaId, memberId, mediaId,
                "https://www.instagram.com/reel/fixture-" + sharedMediaId + "/", createdAt);
    }

    public static void insertPlace(
            JdbcTemplate jdbcTemplate,
            Long placeId,
            String name,
            String thumbnailUrl,
            String category,
            String address
    ) {
        insertPlace(jdbcTemplate, placeId, name, thumbnailUrl, category, address, address);
    }

    public static void insertPlace(
            JdbcTemplate jdbcTemplate,
            Long placeId,
            String name,
            String thumbnailUrl,
            String category,
            String landLotAddress,
            String roadAddress
    ) {
        jdbcTemplate.update("""
                INSERT INTO places (
                    id, kakao_place_id, name, category, land_lot_address, road_address,
                    latitude, longitude, kakao_place_url, thumbnail_url
                )
                VALUES (?, ?, ?, ?, ?, ?, 37.5796, 126.9770, ?, ?)
                """, placeId, "kakao-fixture-" + placeId, name, category, landLotAddress, roadAddress,
                "https://place.map.kakao.com/" + placeId, thumbnailUrl);
    }

    public static void insertPlaceCandidate(
            JdbcTemplate jdbcTemplate,
            Long candidateId,
            Long sharedMediaId,
            Long placeId,
            String decisionStatus
    ) {
        jdbcTemplate.update("""
                INSERT INTO place_candidates (id, shared_media_id, place_id, decision_status)
                VALUES (?, ?, ?, ?)
                """, candidateId, sharedMediaId, placeId, decisionStatus);
    }

}
