package com.yeogidam.media.domain;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.Getter;

/**
 * 사용자가 공유한 인스타그램 URL. 받은 원본(사실)을 그대로 보관하고 shortcode(해석)를 추출한다.
 * 원본은 실패 미디어의 "원본 릴스로 이동"과 재처리의 근거, shortcode는 동등성과 재사용의 키다.
 */
@Getter
public class InstagramUrl {

    private static final String INSTAGRAM_HOST = "instagram.com";
    private static final String INSTAGRAM_WWW_HOST = "www.instagram.com";
    private static final Pattern MEDIA_PATH_PATTERN = Pattern.compile("^/(?:p|reel)/([^/]+)/?$");

    private final String sharedUrl;
    private final MediaShortcode mediaShortcode;

    public InstagramUrl(String value) {
        validateNotBlank(value);

        URI uri = parse(value);
        validateScheme(uri);
        validateHost(uri);

        this.sharedUrl = value;
        this.mediaShortcode = extractMediaShortcode(uri);
    }

    private void validateNotBlank(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("인스타그램 URL이 비어 있습니다.");
        }
    }

    private URI parse(String value) {
        try {
            return URI.create(value.trim());
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("올바른 URL 형식이 아닙니다: " + value, exception);
        }
    }

    private void validateScheme(URI uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("HTTPS 인스타그램 URL만 지원합니다: " + uri);
        }
    }

    private void validateHost(URI uri) {
        String host = uri.getHost();
        if (INSTAGRAM_HOST.equalsIgnoreCase(host)) {
            return;
        }

        if (INSTAGRAM_WWW_HOST.equalsIgnoreCase(host)) {
            return;
        }

        throw new IllegalArgumentException("인스타그램 URL만 지원합니다: " + uri);
    }

    private MediaShortcode extractMediaShortcode(URI uri) {
        Matcher matcher = MEDIA_PATH_PATTERN.matcher(uri.getPath());
        if (!matcher.matches()) {
            throw new IllegalArgumentException("인스타그램 게시글과 릴스 URL만 지원합니다: " + uri);
        }
        return new MediaShortcode(matcher.group(1));
    }

    // 동등성은 게시물 정체성인 shortcode만 본다. 받은 원본(sharedUrl)은 동등성에서 제외한다.
    @Override
    public boolean equals(Object other) {
        return other instanceof InstagramUrl that && mediaShortcode.equals(that.mediaShortcode);
    }

    @Override
    public int hashCode() {
        return mediaShortcode.hashCode();
    }

    @Override
    public String toString() {
        return mediaShortcode.value();
    }
}
