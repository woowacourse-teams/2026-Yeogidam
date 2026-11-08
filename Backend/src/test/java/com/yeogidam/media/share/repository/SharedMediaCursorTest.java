package com.yeogidam.media.share.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class SharedMediaCursorTest {

    private static final Instant CREATED_AT = Instant.parse("2026-11-01T03:00:00.123456Z");
    private static final Long SHARED_MEDIA_ID = 123L;

    @Test
    void 공유_시각과_ID가_모두_없으면_첫_페이지를_위한_빈_커서를_반환한다() {
        // when
        Optional<SharedMediaCursor> cursor = SharedMediaCursor.fromParameters(null, null);

        // then
        assertThat(cursor)
                .isEmpty();
    }

    @Test
    void 공유_시각과_ID가_모두_있으면_두_값으로_커서를_만든다() {
        // when
        Optional<SharedMediaCursor> cursor = SharedMediaCursor.fromParameters(CREATED_AT, SHARED_MEDIA_ID);

        // then
        assertThat(cursor)
                .contains(new SharedMediaCursor(CREATED_AT, SHARED_MEDIA_ID));
    }

    @Test
    void 공유_시각만_있으면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> SharedMediaCursor.fromParameters(CREATED_AT, null))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(MediaErrorCode.INCOMPLETE_CURSOR));
    }

    @Test
    void 공유_ID만_있으면_예외가_발생한다() {
        // when & then
        assertThatThrownBy(() -> SharedMediaCursor.fromParameters(null, SHARED_MEDIA_ID))
                .isInstanceOfSatisfying(MediaException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(MediaErrorCode.INCOMPLETE_CURSOR));
    }
}
