package com.yeogidam.media.domain;

/**
 * 사용자가 공유한 링크. 받은 원본(사실)과 파싱된 정체성(해석)을 한 쌍으로 든다.
 * 원본은 실패 미디어의 "원본 릴스로 이동"과 재처리의 근거, 정체성은 동등성과 재사용의 키다.
 */
public record SharedLink(
        String sharedUrl,
        InstagramUrl instagramUrl
) {

    public SharedLink {
        if (sharedUrl == null || sharedUrl.isBlank()) {
            throw new IllegalArgumentException("원본 링크가 비어 있습니다.");
        }
        if (instagramUrl == null) {
            throw new IllegalArgumentException("인스타그램 URL이 비어 있습니다.");
        }
    }

    public SharedLink(String sharedUrl) {
        this(sharedUrl, new InstagramUrl(sharedUrl));
    }
}
