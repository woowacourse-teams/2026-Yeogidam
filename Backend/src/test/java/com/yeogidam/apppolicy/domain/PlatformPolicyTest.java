package com.yeogidam.apppolicy.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * 최소 1.2.0, 최신 1.4.0일 때 앱 버전에 따른 세 구간 판정을 고정한다. 경계(최소와 같음, 최신과 같음)가 중요하다.
 */
class PlatformPolicyTest {

    private static final PlatformPolicy POLICY = new PlatformPolicy(
            new AppVersion("1.2.0"), new AppVersion("1.4.0"), "https://apps.apple.com/kr/app/id1");

    @ParameterizedTest(name = "앱 {0} → 강제 {1}, 권고 {2}")
    @CsvSource({
            "1.1.9, true, false",
            "1.2.0, false, true",
            "1.3.5, false, true",
            "1.4.0, false, false",
            "2.0.0, false, false"
    })
    void 앱_버전이_최소_지원_버전_아래면_강제이고_최신_버전_아래면_권고다(String appVersion, boolean required, boolean recommended) {
        // when
        UpdateDecision decision = POLICY.decide(new AppVersion(appVersion));

        // then
        assertAll(
                () -> assertThat(decision.required()).isEqualTo(required),
                () -> assertThat(decision.recommended()).isEqualTo(recommended),
                () -> assertThat(decision.policy()).isSameAs(POLICY)
        );
    }

    @Test
    void 최신_버전이_최소_지원_버전보다_낮으면_예외가_발생한다() {
        assertThatThrownBy(() -> new PlatformPolicy(new AppVersion("1.4.0"), new AppVersion("1.2.0"), "https://a.b"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 최소_지원_버전이_비어_있으면_예외가_발생한다() {
        assertThatThrownBy(() -> new PlatformPolicy(null, new AppVersion("1.4.0"), "https://a.b"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 최신_버전이_비어_있으면_예외가_발생한다() {
        assertThatThrownBy(() -> new PlatformPolicy(new AppVersion("1.2.0"), null, "https://a.b"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 스토어_주소가_비어_있으면_예외가_발생한다() {
        assertThatThrownBy(() -> new PlatformPolicy(new AppVersion("1.2.0"), new AppVersion("1.4.0"), null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 스토어_주소가_https가_아니면_예외가_발생한다() {
        assertThatThrownBy(() -> new PlatformPolicy(new AppVersion("1.2.0"), new AppVersion("1.4.0"), "http://a.b"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
