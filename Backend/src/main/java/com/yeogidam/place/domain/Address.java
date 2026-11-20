package com.yeogidam.place.domain;

/**
 * 지번과 도로명은 한 장소의 주소라는 같은 개념의 두 표기라 함께 묶고, 주소가 있는 나라(ISO 3166-1 alpha-2)를 함께 든다.
 * 지번은 필수, 도로명은 없을 수 있다(빈 문자열은 null로 정규화).
 * 해외 장소는 지번과 도로명을 나누지 않아서 Google 주소 한 줄을 지번 자리에 둔다.
 */
public record Address(
        String landLotAddress,
        String roadAddress,
        CountryCode countryCode
) {

    public Address {
        if (landLotAddress == null || landLotAddress.isBlank()) {
            throw new IllegalArgumentException("지번 주소가 비어 있습니다.");
        }

        if (roadAddress != null && roadAddress.isBlank()) {
            roadAddress = null;
        }

        if (countryCode == null) {
            throw new IllegalArgumentException("나라 코드가 비어 있습니다.");
        }
    }

    /**
     * 국내 주소로, 나라는 한국(KR)이다.
     */
    public Address(String landLotAddress, String roadAddress) {
        this(landLotAddress, roadAddress, CountryCode.KOREA);
    }
}
