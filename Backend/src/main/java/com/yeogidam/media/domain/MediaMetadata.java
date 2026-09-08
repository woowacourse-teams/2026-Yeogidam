package com.yeogidam.media.domain;

/**
 * 인스타그램에서 받아온 미디어 부속 정보. 도메인이 들되 검증하지 않는다.
 * caption은 추출의 입력이었던 사실이라 함께 보관한다(재추출 없이 재분석할 근거).
 * 추출 전에는 전부 비어 있을 수 있다.
 */
public record MediaMetadata(
        String title,
        String caption,
        String thumbnailUrl,
        String authorUsername
) {
}
