package com.yeogidam.support;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.domain.Coordinate;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceExternalSource;
import com.yeogidam.place.domain.PlaceName;
import com.yeogidam.place.domain.PlaceProfile;
import java.math.BigDecimal;

public final class PlaceFixture {

    private PlaceFixture() {
    }

    public static Place place(Long id) {
        return new Place(
                id,
                new PlaceExternalSource("kakao-" + id, "https://place.map.kakao.com/" + id),
                new PlaceProfile(
                        new PlaceName("경복궁"),
                        new Address("서울 종로구 세종로 1-1", "서울 종로구 사직로 161"),
                        new Coordinate(new BigDecimal("37.5796"), new BigDecimal("126.9770")),
                        "관광명소",
                        null,
                        null
                )
        );
    }
}
