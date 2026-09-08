package com.yeogidam.media.service;

import com.yeogidam.media.domain.MediaShortcode;

/**
 * 게시물 내용을 읽어 오는 포트.
 * 실제 구현은 embed 페이지 조회(수파베이스 파이프라인의 수집 단계). 지금은 Fake로 대체한다.
 */
public interface InstagramContentReader {

    InstagramContent read(MediaShortcode shortcode);
}
