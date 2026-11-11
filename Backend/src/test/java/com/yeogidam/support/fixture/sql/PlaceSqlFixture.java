package com.yeogidam.support.fixture.sql;

import java.math.BigDecimal;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * places 행을 DAO를 거치지 않고 직접 넣는다. 카카오 장소는 열 전부를 받는 것과 필수 열만 받는 것이 있고, 구글 장소를 넣는 것이 따로 있다.
 * 카카오 장소는 kakao_place_id만 넣어도 지도 제공자(KAKAO), 외부 장소 ID, 나라(KR)가 기본값으로 채워진다.
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
            String thumbnailKey,
            String thumbnailSource
    ) {
        jdbcTemplate.update("""
                INSERT INTO places (id, kakao_place_id, name, category, land_lot_address, road_address,
                                    latitude, longitude, kakao_place_url, telephone,
                                    thumbnail_key, thumbnail_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                placeId, kakaoPlaceId, name, category, landLotAddress, roadAddress,
                latitude, longitude, kakaoPlaceUrl, telephone,
                thumbnailKey, thumbnailSource
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
                latitude, longitude, null, null, null, null);
    }

    /**
     * 구글 장소는 카카오 장소 ID가 없어서 지도 제공자, 외부 장소 ID, 나라를 직접 넣고 kakao_place_id는 비운다.
     */
    public static void insertGooglePlace(
            JdbcTemplate jdbcTemplate,
            Long placeId,
            String googlePlaceId,
            String countryCode,
            String name,
            String category,
            String address,
            BigDecimal latitude,
            BigDecimal longitude
    ) {
        jdbcTemplate.update("""
                INSERT INTO places (id, map_provider, external_place_id, country_code, name, category,
                                    land_lot_address, latitude, longitude)
                VALUES (?, 'GOOGLE', ?, ?, ?, ?, ?, ?, ?)
                """,
                placeId, googlePlaceId, countryCode, name, category, address, latitude, longitude
        );
    }
}
