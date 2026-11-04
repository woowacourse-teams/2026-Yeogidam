package com.yeogidam.media.share.repository;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import java.time.Instant;
import java.util.Optional;

/**
 * 히스토리 다음 페이지를 어디서부터 읽을지 나타낸다.
 * 화면에 마지막으로 불러온 공유의 공유 시각과 ID를 담는다.
 */
public record SharedMediaCursor(
        Instant createdAt,
        Long sharedMediaId
) {

    /**
     * 요청으로 받은 커서 두 값으로 커서를 만든다. 두 값이 모두 없으면 첫 페이지라 빈 값을 돌려주고,
     * 하나만 오면 어디서부터 읽을지 알 수 없어 예외를 던진다.
     */
    public static Optional<SharedMediaCursor> fromParameters(Instant createdAt, Long sharedMediaId) {
        if (createdAt == null && sharedMediaId == null) {
            return Optional.empty();
        }
        if (createdAt == null || sharedMediaId == null) {
            throw new MediaException(MediaErrorCode.INCOMPLETE_CURSOR);
        }
        return Optional.of(new SharedMediaCursor(createdAt, sharedMediaId));
    }
}
