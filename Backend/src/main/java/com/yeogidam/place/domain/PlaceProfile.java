package com.yeogidam.place.domain;

/**
 * 외부(카카오 검색, 사진 출처)에서 받아와 채우는 장소의 표시 정보.
 * 이름, 주소, 좌표는 규칙이 있어 값 객체이고, 나머지는 검증 없이 담는다.
 */
public record PlaceProfile(
        PlaceName name,
        Address address,
        Coordinate coordinate,
        String category,
        String telephone,
        PlaceThumbnail thumbnail
) {

    public PlaceProfile {
        if (name == null) {
            throw new IllegalArgumentException("장소 이름이 비어 있습니다.");
        }
        if (address == null) {
            throw new IllegalArgumentException("주소가 비어 있습니다.");
        }
        if (coordinate == null) {
            throw new IllegalArgumentException("좌표가 비어 있습니다.");
        }
    }
}
