package com.yeogidam.place.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class AddressTest {

    @Test
    void 지번과_도로명으로_주소를_만든다() {
        // when
        Address address = new Address("서울 성동구 성수동2가 289-10", "서울 성동구 성수이로 88");

        // then
        assertAll(
                () -> assertThat(address.landLotAddress()).isEqualTo("서울 성동구 성수동2가 289-10"),
                () -> assertThat(address.roadAddress()).isEqualTo("서울 성동구 성수이로 88")
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void 도로명이_없거나_비어_있으면_null로_정규화한다(String roadAddress) {
        // when
        Address address = new Address("서울 성동구 성수동2가 289-10", roadAddress);

        // then
        assertThat(address.roadAddress()).isNull();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   "})
    void 지번이_비어_있으면_예외가_발생한다(String landLotAddress) {
        assertThatThrownBy(() -> new Address(landLotAddress, "서울 성동구 성수이로 88"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 요약_주소는_도와_시군구까지만_남긴다() {
        assertAll(
                () -> assertThat(new Address("서울 성동구 성수동2가 289-10", null).summary())
                        .isEqualTo("서울 성동구"),
                () -> assertThat(new Address("경기도 성남시 분당구 판교역로 166", null).summary())
                        .isEqualTo("경기도 성남시"),
                () -> assertThat(new Address("세종특별자치시", null).summary())
                        .isEqualTo("세종특별자치시")
        );
    }
}
