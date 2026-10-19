package com.yeogidam.apppolicy.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.apppolicy.exception.AppPolicyErrorCode;
import com.yeogidam.apppolicy.exception.AppPolicyException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

class AppVersionTest {

    @Test
    void 주_부_수정을_정수로_읽는다() {
        // when
        AppVersion version = new AppVersion("1.10.3");

        // then
        assertAll(
                () -> assertThat(version.major()).isEqualTo(1),
                () -> assertThat(version.minor()).isEqualTo(10),
                () -> assertThat(version.patch()).isEqualTo(3)
        );
    }

    @Test
    void 수정_자리가_생략된_버전은_0인_버전과_같다() {
        // given
        AppVersion shortForm = new AppVersion("1.2");
        AppVersion longForm = new AppVersion("1.2.0");

        // when & then
        assertAll(
                () -> assertThat(shortForm).isEqualTo(longForm),
                () -> assertThat(shortForm.isLowerThan(longForm)).isFalse(),
                () -> assertThat(longForm.isLowerThan(shortForm)).isFalse()
        );
    }

    @ParameterizedTest
    @CsvSource({
            "1.9.0, 1.10.0",
            "1.2.3, 1.3.0",
            "1.2.3, 2.0.0",
            "1.2.0, 1.2.1"
    })
    void 자리별_정수로_비교한다(String lower, String higher) {
        assertAll(
                () -> assertThat(new AppVersion(lower).isLowerThan(new AppVersion(higher))).isTrue(),
                () -> assertThat(new AppVersion(higher).isLowerThan(new AppVersion(lower))).isFalse()
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"1", "1.2.3.4", "01.2.0", "1.2.0-beta", "v1.2.0", "1.a.0", " 1.2.0", "1..0"})
    void 형식이_아니면_예외가_발생한다(String value) {
        assertThatThrownBy(() -> new AppVersion(value))
                .isInstanceOfSatisfying(AppPolicyException.class, exception ->
                        assertThat(exception.getErrorCode()).isEqualTo(AppPolicyErrorCode.INVALID_APP_VERSION));
    }

    @Test
    void 표기는_항상_세_자리다() {
        assertThat(new AppVersion("1.2").value()).isEqualTo("1.2.0");
    }
}
