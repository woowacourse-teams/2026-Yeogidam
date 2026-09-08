package com.yeogidam.media.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class InstagramUrlTest {

    @Test
    void 지원하는_릴스_링크로_생성된다() {
        // given
        String url = "https://www.instagram.com/reel/DcVaTEdRMyP/";

        // when & then
        assertThatCode(() -> new InstagramUrl(url))
                .doesNotThrowAnyException();
    }

    @Test
    void 지원하는_게시글_링크로_생성된다() {
        // given
        String url = "https://www.instagram.com/p/DPP0xjkEoi3/";

        // when & then
        assertThatCode(() -> new InstagramUrl(url))
                .doesNotThrowAnyException();
    }

    @Test
    void 링크에서_미디어_shortcode를_뽑는다() {
        // given
        String url = "https://www.instagram.com/reel/DcVaTEdRMyP/";

        // when
        InstagramUrl instagramUrl = new InstagramUrl(url);

        // then
        assertThat(instagramUrl.getMediaShortcode())
                .isEqualTo(new MediaShortcode("DcVaTEdRMyP"));
    }

    @Test
    void 앱_공유가_붙이는_쿼리스트링은_버린다() {
        // given
        String url = "https://www.instagram.com/p/DPP0xjkEoi3/?igsh=d3luM3I0cGNheW9o";

        // when
        InstagramUrl instagramUrl = new InstagramUrl(url);

        // then
        assertThat(instagramUrl.getMediaShortcode())
                .isEqualTo(new MediaShortcode("DPP0xjkEoi3"));
    }

    @Test
    void 링크가_null이면_예외가_발생한다() {
        // given
        String url = null;

        // when & then
        assertThatThrownBy(() -> new InstagramUrl(url))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("인스타그램 URL이 비어 있습니다.");
    }

    @Test
    void 링크가_공백뿐이면_예외가_발생한다() {
        // given
        String url = "   ";

        // when & then
        assertThatThrownBy(() -> new InstagramUrl(url))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("인스타그램 URL이 비어 있습니다.");
    }

    @Test
    void 인스타그램_주소가_아니면_예외가_발생한다() {
        // given
        String url = "https://www.tiktok.com/@someone/video/123";

        // when & then
        assertThatThrownBy(() -> new InstagramUrl(url))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("인스타그램 URL만 지원합니다");
    }

    @Test
    void https_외의_스킴이면_예외가_발생한다() {
        // given
        String url = "ftp://www.instagram.com/reel/DcVaTEdRMyP/";

        // when & then
        assertThatThrownBy(() -> new InstagramUrl(url))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("HTTPS 인스타그램 URL만 지원합니다");
    }

    @Test
    void 주소_형식이_깨졌으면_예외가_발생한다() {
        // given
        String url = "https://www.instagram.com/reel/ ABC /";

        // when & then
        assertThatThrownBy(() -> new InstagramUrl(url))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 프로필_주소면_예외가_발생한다() {
        // given
        String url = "https://www.instagram.com/trendspot.mag/";

        // when & then
        assertThatThrownBy(() -> new InstagramUrl(url))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("인스타그램 게시글과 릴스 URL만 지원합니다");
    }

    @Test
    void 복수형_reels_경로면_예외가_발생한다() {
        // given
        String url = "https://www.instagram.com/media/Dcx0WFJtLfb/";

        // when & then
        assertThatThrownBy(() -> new InstagramUrl(url))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("인스타그램 게시글과 릴스 URL만 지원합니다");
    }

    @Test
    void 계정명이_낀_주소면_예외가_발생한다() {
        // given
        String url = "https://www.instagram.com/trendspot.mag/p/DPP0xjkEoi3/";

        // when & then
        assertThatThrownBy(() -> new InstagramUrl(url))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("인스타그램 게시글과 릴스 URL만 지원합니다");
    }

    @Test
    void 같은_shortcode면_경로가_달라도_동등하다() {
        // given
        InstagramUrl reelForm = new InstagramUrl("https://www.instagram.com/reel/DcVaTEdRMyP/");
        InstagramUrl postForm = new InstagramUrl("https://www.instagram.com/p/DcVaTEdRMyP/");

        // when & then
        assertThat(reelForm).isEqualTo(postForm);
    }
}
