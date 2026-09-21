package com.yeogidam.support.fixture.sql;

import org.springframework.jdbc.core.JdbcTemplate;

public final class PlaceFixture {

    private PlaceFixture() {
    }

    public static void createPlace(
            JdbcTemplate jdbcTemplate,
            Long placeId,
            String name,
            String thumbnailUrl,
            String category,
            String address
    ) {
        createPlace(jdbcTemplate, placeId, name, thumbnailUrl, category, address, address);
    }

    public static void createPlace(
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
}
