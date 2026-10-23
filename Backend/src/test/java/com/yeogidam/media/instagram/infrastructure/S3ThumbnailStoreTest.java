package com.yeogidam.media.instagram.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class S3ThumbnailStoreTest {

    @Test
    void 카카오_대표_사진의_pstatic_CDN을_허용한다() {
        // when
        boolean allowed = S3ThumbnailStore.isKakaoCdn("postfiles.pstatic.net");

        // then
        assertThat(allowed).isTrue();
    }

    @Test
    void pstatic의_다른_호스트는_허용하지_않는다() {
        // when
        boolean allowed = S3ThumbnailStore.isKakaoCdn("evilpostfiles.pstatic.net");

        // then
        assertThat(allowed).isFalse();
    }
}
