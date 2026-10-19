package com.yeogidam.place.domain;

/**
 * 지번·도로명은 한 장소의 주소라는 같은 개념의 두 표기라 함께 묶는다.
 * 지번은 필수, 도로명은 없을 수 있다(빈 문자열은 null로 정규화).
 */
public record Address(
        String landLotAddress,
        String roadAddress
) {

    public Address {
        if (landLotAddress == null || landLotAddress.isBlank()) {
            throw new IllegalArgumentException("지번 주소가 비어 있습니다.");
        }

        if (roadAddress != null && roadAddress.isBlank()) {
            roadAddress = null;
        }
    }
}
