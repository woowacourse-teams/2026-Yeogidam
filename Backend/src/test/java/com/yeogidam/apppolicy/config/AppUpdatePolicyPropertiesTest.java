package com.yeogidam.apppolicy.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.BindException;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource;

/**
 * 설정이 비었거나 틀리면 기동에 실패하는지 본다. 어노테이션 대신 생성자가 막고 있으므로 바인딩 경로로 확인한다.
 */
class AppUpdatePolicyPropertiesTest {

    @Test
    void 두_플랫폼_설정이_모두_있으면_바인딩된다() {
        // when
        AppUpdatePolicyProperties properties = bind(settings());

        // then
        assertThat(properties.ios().storeUrl()).isEqualTo("https://apps.apple.com/kr/app/id1");
    }

    @Test
    void 플랫폼_설정이_하나라도_없으면_기동에_실패한다() {
        // given
        Map<String, String> settings = settings();
        settings.keySet().removeIf(key -> key.startsWith("app-update.android"));

        // when & then
        assertThatThrownBy(() -> bind(settings))
                .isInstanceOf(BindException.class)
                .hasRootCauseInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 스토어_주소가_https가_아니면_기동에_실패한다() {
        // given
        Map<String, String> settings = settings();
        settings.put("app-update.ios.store-url", "http://apps.apple.com/kr/app/id1");

        // when & then
        assertThatThrownBy(() -> bind(settings))
                .isInstanceOf(BindException.class)
                .hasRootCauseInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 최신_버전이_최소_지원_버전보다_낮으면_기동에_실패한다() {
        // given
        Map<String, String> settings = settings();
        settings.put("app-update.ios.latest-version", "1.0.0");

        // when & then
        assertThatThrownBy(() -> bind(settings))
                .isInstanceOf(BindException.class)
                .hasRootCauseInstanceOf(IllegalArgumentException.class);
    }

    private AppUpdatePolicyProperties bind(Map<String, String> settings) {
        return new Binder(new MapConfigurationPropertySource(settings))
                .bind("app-update", AppUpdatePolicyProperties.class)
                .get();
    }

    private Map<String, String> settings() {
        Map<String, String> settings = new HashMap<>();
        settings.put("app-update.ios.minimum-supported-version", "1.2.0");
        settings.put("app-update.ios.latest-version", "1.4.0");
        settings.put("app-update.ios.store-url", "https://apps.apple.com/kr/app/id1");
        settings.put("app-update.android.minimum-supported-version", "1.1.0");
        settings.put("app-update.android.latest-version", "1.3.0");
        settings.put("app-update.android.store-url", "https://play.google.com/store/apps/details?id=a");
        return settings;
    }
}
