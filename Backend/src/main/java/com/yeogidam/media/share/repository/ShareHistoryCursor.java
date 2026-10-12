package com.yeogidam.media.share.repository;

import java.time.Instant;

/**
 * 히스토리 다음 페이지를 어디서부터 읽을지 나타낸다.
 * 화면에 마지막으로 불러온 공유의 공유 시각과 ID를 담는다.
 */
public record ShareHistoryCursor(
        Instant createdAt,
        Long sharedMediaId
) {
}
