package com.yeogidam.media.instagram.domain;

/** 인스타그램 페이지에서 파싱한 원본 메타데이터. 썸네일 URL은 만료될 수 있다. */
public record MediaMetadataWithUrl(
        String caption,
        String thumbnailUrl,
        String author
) {
}
