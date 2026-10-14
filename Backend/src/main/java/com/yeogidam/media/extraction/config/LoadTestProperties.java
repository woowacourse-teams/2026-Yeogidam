package com.yeogidam.media.extraction.config;

import java.net.URI;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("media.extraction.load-test")
public record LoadTestProperties(URI fakeBaseUrl, String fakeKey, String shortcodePrefix, Set<Long> memberIds) {

    public LoadTestProperties {
        if (fakeBaseUrl == null || fakeBaseUrl.getHost() == null
                || !Set.of("http", "https").contains(fakeBaseUrl.getScheme())
                || fakeBaseUrl.getUserInfo() != null || fakeBaseUrl.getQuery() != null
                || fakeBaseUrl.getFragment() != null
                || !Set.of("", "/").contains(fakeBaseUrl.getPath())) {
            throw new IllegalArgumentException("HTTP Fake 주소는 경로가 없는 http 또는 https 주소여야 합니다.");
        }
        if (fakeKey == null || fakeKey.isBlank()) {
            throw new IllegalArgumentException("HTTP Fake 인증 키가 필요합니다.");
        }
        if (shortcodePrefix == null || !shortcodePrefix.matches("ydlt_[A-Za-z0-9-]{1,24}_")) {
            throw new IllegalArgumentException("전용 shortcode 접두사는 ydlt_실행식별자_ 형식이어야 합니다.");
        }
        if (memberIds == null || memberIds.isEmpty() || memberIds.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new IllegalArgumentException("부하테스트 회원 식별자가 필요합니다.");
        }
        memberIds = Set.copyOf(memberIds);
    }

    public boolean isDedicatedMedia(String shortcode) {
        return shortcode.startsWith(shortcodePrefix);
    }

    public boolean isAllowedMember(Long memberId) {
        return memberIds.contains(memberId);
    }
}
