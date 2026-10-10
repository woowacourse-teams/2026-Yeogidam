package com.yeogidam.auth.config.oauth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 서버 콜백이 인가 코드를 넘겨 줄 앱 주소. 인앱 브라우저가 앱 스킴 주소로 이동하면 닫히면서 앱으로 돌아간다.
 * 값이 비어 있으면 기동에 실패한다.
 */
@ConfigurationProperties("oauth")
public record OAuthProperties(String appCallbackUri) {

    public OAuthProperties {
        if (appCallbackUri == null || appCallbackUri.isBlank()) {
            throw new IllegalArgumentException("앱 콜백 URI가 비어 있습니다.");
        }
    }
}
