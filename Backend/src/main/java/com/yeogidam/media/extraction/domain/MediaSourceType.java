package com.yeogidam.media.extraction.domain;

/**
 * 게시물이 어떻게 들어왔는지. EXTRACTED는 공유 링크로 들어와 추출 파이프라인을 탄 게시물이고,
 * SEEDED는 운영이 시드 데이터로 넣은 게시물이라 추출 파이프라인을 타지 않는다.
 */
public enum MediaSourceType {

    EXTRACTED,
    SEEDED
}
