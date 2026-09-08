package com.yeogidam.place.domain;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * 지번·도로명은 한 장소의 주소라는 같은 개념의 두 표기라 함께 묶는다.
 * 지번은 필수, 도로명은 없을 수 있다(빈 문자열은 null로 정규화).
 */
public record Address(
        String landLotAddress,
        String roadAddress
) {

    private static final String SEPARATOR = " ";
    private static final int SUMMARY_DEPTH = 2;

    public Address {
        if (landLotAddress == null || landLotAddress.isBlank()) {
            throw new IllegalArgumentException("지번 주소가 비어 있습니다.");
        }

        if (roadAddress != null && roadAddress.isBlank()) {
            roadAddress = null;
        }
    }

    /**
     * 화면 명세의 표기 규칙: '도/시' '시/군/구'까지만 보여준다.
     * 예) "서울 성동구 성수동2가 289-10" → "서울 성동구"
     */
    public String summary() {
        return Arrays.stream(landLotAddress.split(SEPARATOR))
                .limit(SUMMARY_DEPTH)
                .collect(Collectors.joining(SEPARATOR));
    }
}
