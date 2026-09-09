package com.yeogidam.place.domain;

/**
 * 장소 대표 사진 한 묶음. 수파베이스의 thumbnail_url·thumbnail_source·photo_attribution에 대응한다.
 * 출처(카카오·구글·인스타그램)에 따라 저작권 표기가 달라지므로 세 값이 함께 다닌다.
 * 사진이 없을 수도 있어 검증하지 않는다.
 */
public record PlaceThumbnail(
        String url,
        String source,
        String attribution
) {
}
