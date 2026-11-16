package com.yeogidam.media.extraction.infrastructure.loadtest;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;

class LoadTestMeasuredInputStreamTest {

    private static final byte[] BODY = {1, 2, 3};

    private final List<Boolean> results = new CopyOnWriteArrayList<>();

    @Test
    void 압축되지_않은_본문은_한_바이트씩_읽어도_Content_Length만큼_받으면_성공을_한_번_기록한다() throws IOException {
        // given
        try (var stream = measured(List.of())) {
            // when
            stream.read();
            stream.read();

            // then
            assertThat(results).isEmpty();

            // when
            stream.read();

            // then
            assertThat(results).containsExactly(true);
        }
        assertThat(results).containsExactly(true);
    }

    @Test
    void 압축된_본문은_한_바이트씩_읽을_때_EOF에_닿아야_성공을_기록한다() throws IOException {
        // given
        try (var stream = measured(List.of("gzip"))) {
            // when
            for (int i = 0; i < BODY.length; i++) {
                stream.read();
            }

            // then
            assertThat(results).isEmpty();

            // when
            assertThat(stream.read()).isEqualTo(-1);

            // then
            assertThat(results).containsExactly(true);
        }
        assertThat(results).containsExactly(true);
    }

    @Test
    void 끝까지_받기_전에_닫으면_실패를_한_번_기록한다() throws IOException {
        // given
        var stream = measured(List.of("gzip"));
        stream.read();

        // when
        stream.close();
        stream.close();

        // then
        assertThat(results).containsExactly(false);
    }

    private LoadTestMeasuredInputStream measured(List<String> encodings) {
        return new LoadTestMeasuredInputStream(new ByteArrayInputStream(BODY), BODY.length, encodings,
                (success, received) -> results.add(success));
    }
}
