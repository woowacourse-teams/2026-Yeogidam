package com.yeogidam.media.instagram.domain;

/**
 * 인스타그램에서 받아온 미디어 부속 정보. 도메인이 들되 검증하지 않는다.
 * 제목은 따로 들지 않는다. 클라이언트가 caption 첫 줄을 잘라 제목으로 보여준다.
 * caption은 추출의 입력이었던 사실이라 함께 보관한다(재추출 없이 재분석할 근거).
 * 추출 전에는 전부 비어 있을 수 있다.
 */
public record MediaMetadata(
        String caption,
        String thumbnailUrl,
        String author
) {
}
