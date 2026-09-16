package com.yeogidam.place.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class CoordinateTest {

    @Test
    void 위도와_경도로_좌표를_만든다() {
        // when
        Coordinate coordinate = new Coordinate(new BigDecimal("37.5443"), new BigDecimal("127.0557"));

        // then
        assertAll(
                () -> assertThat(coordinate.latitude()).isEqualByComparingTo("37.5443"),
                () -> assertThat(coordinate.longitude()).isEqualByComparingTo("127.0557")
        );
    }

    @ParameterizedTest
    @CsvSource({"90, 180", "-90, -180", "0, 0"})
    void 위도_90과_경도_180의_경계값은_허용한다(String latitude, String longitude) {
        assertThatCode(() -> new Coordinate(new BigDecimal(latitude), new BigDecimal(longitude)))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @CsvSource({"90.0001, 0", "-90.0001, 0", "0, 180.0001", "0, -180.0001"})
    void 위도나_경도가_범위를_벗어나면_예외가_발생한다(String latitude, String longitude) {
        assertThatThrownBy(() -> new Coordinate(new BigDecimal(latitude), new BigDecimal(longitude)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 위도나_경도가_없으면_예외가_발생한다() {
        assertAll(
                () -> assertThatThrownBy(() -> new Coordinate(null, BigDecimal.ONE))
                        .isInstanceOf(IllegalArgumentException.class),
                () -> assertThatThrownBy(() -> new Coordinate(BigDecimal.ONE, null))
                        .isInstanceOf(IllegalArgumentException.class)
        );
    }
}
