package com.yeogidam.media.share.config;

import com.yeogidam.media.instagram.domain.InstagramUrl;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 온보딩에 쓰는 릴스. 온보딩 보관함을 회원 보관함으로 옮길 때 이 릴스의 공유 이력을 만든다.
 * 값이 비었거나 인스타그램 링크 형식이 아니면 기동에 실패한다.
 */
@ConfigurationProperties("onboarding")
public record OnboardingProperties(String instagramUrl) {

    public OnboardingProperties {
        if (instagramUrl == null || instagramUrl.isBlank()) {
            throw new IllegalArgumentException("온보딩 릴스 URL이 비어 있습니다.");
        }
        new InstagramUrl(instagramUrl);
    }

    public InstagramUrl toInstagramUrl() {
        return new InstagramUrl(instagramUrl);
    }
}
