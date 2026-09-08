package com.yeogidam.media.service;

/**
 * 인스타그램 조회 어댑터의 산출물. 검증 없이 담는다.
 */
public record InstagramContent(
        String title,
        String caption,
        String thumbnailUrl,
        String authorUsername
) {
}
