package com.yeogidam.support.fixture.sql;

import java.math.BigDecimal;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * places 행을 DAO를 거치지 않고 직접 넣는다. 열 전부를 받는 것 하나와 필수 열만 받는 것 하나가 있다.
 */
public final class PlaceSqlFixture {

    private PlaceSqlFixture() {
    }

    public static void insertPlace(
            JdbcTemplate jdbcTemplate,
            Long placeId,
            String kakaoPlaceId,
            String name,
            String category,
            String landLotAddress,
            String roadAddress,
            BigDecimal latitude,
            BigDecimal longitude,
            String kakaoPlaceUrl,
            String telephone,
            String thumbnailUrl,
            String thumbnailSource,
            String thumbnailAttribution
    ) {
        jdbcTemplate.update("""
                INSERT INTO places (id, kakao_place_id, name, category, land_lot_address, road_address,
                                    latitude, longitude, kakao_place_url, telephone,
                                    thumbnail_url, thumbnail_source, thumbnail_attribution)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                placeId, kakaoPlaceId, name, category, landLotAddress, roadAddress,
                latitude, longitude, kakaoPlaceUrl, telephone,
                thumbnailUrl, thumbnailSource, thumbnailAttribution
        );
    }

    /**
     * 필수 열(식별자, 이름, 지번, 좌표)만 채우고 비어 있을 수 있는 열은 전부 NULL로 둔다.
     */
    public static void insertPlaceWithRequiredColumnsOnly(
            JdbcTemplate jdbcTemplate,
            Long placeId,
            String kakaoPlaceId,
            String name,
            String landLotAddress,
            BigDecimal latitude,
            BigDecimal longitude
    ) {
        insertPlace(jdbcTemplate, placeId, kakaoPlaceId, name, null, landLotAddress, null,
                latitude, longitude, null, null, null, null, null);
    }
}
