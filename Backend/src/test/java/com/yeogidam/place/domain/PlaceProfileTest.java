package com.yeogidam.place.domain;

import static com.yeogidam.support.PlaceFixture.place;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.junit.jupiter.api.Test;

class PlaceProfileTest {

    @Test
    void 이름이나_주소나_좌표가_없으면_예외가_발생한다() {
        // given
        PlaceProfile profile = place(1L).profile();

        // when & then
        assertAll(
                () -> assertThatThrownBy(() -> new PlaceProfile(
                        null, profile.address(), profile.coordinate(), null, null, null))
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new PlaceProfile(
                        profile.name(), null, profile.coordinate(), null, null, null))
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new PlaceProfile(
                        profile.name(), profile.address(), null, null, null, null))
                        .isInstanceOf(IllegalArgumentException.class)
        );
    }
}
