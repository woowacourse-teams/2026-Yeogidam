package com.yeogidam.media.infrastructure;

import com.yeogidam.media.domain.MediaShortcode;
import com.yeogidam.media.service.InstagramContent;
import com.yeogidam.media.service.InstagramContentReader;
import org.springframework.stereotype.Component;

/**
 * TODO 실제 구현으로 교체한다.
 * 수파베이스 파이프라인처럼 embed 페이지를 Twitterbot UA로 조회해 캡션·썸네일을 얻는다.
 */
@Component
public class FakeInstagramContentReader implements InstagramContentReader {

    @Override
    public InstagramContent read(MediaShortcode mediaShortcode) {
        String shortcode = mediaShortcode.value();
        return new InstagramContent(
                "성수 감성 카페 릴스 " + shortcode,
                "성수에서 발견한 카페 온월, 분위기 최고",
                "https://picsum.photos/seed/" + shortcode + "/400",
                "seoul_sources");
    }
}
