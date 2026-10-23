package com.yeogidam.media.instagram;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadataWithUrl;
import com.yeogidam.media.instagram.exception.InstagramContentUnavailableException;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaHtmlReader;
import java.net.URI;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** 사용자가 제공한 인스타그램 게시물에서 실제 메타데이터와 썸네일을 조회한다. */
class InstagramMediaHtmlReaderTest {

    private static final String REEL_URL =
            "https://www.instagram.com/reel/DZhRsDGgdVs/";
    private static final String FULL_CAPTION = String.join(" ",
            "떡 좋아하시면 이 집 무조건 좋아하실 것 같습니다 바로 가보시죠",
            "들어가자마자 연예인 싸인 가득한 이곳은 성수에서 핫한 떡집 오복떡집입니다",
            "@obok4876662",
            "어머님이 떡도 바로 잘라서 만들어 주시고 다양한 떡 종류가 있어서 좋았습니다",
            "흑임자 호박떡과 모나카 앙버터 떡 바로 구매하고",
            "앙버터 떡은 떡, 버터, 팥 조합이 달달 고소 식감까지 완벽해서 또 먹으러 가고 싶은 맛이고",
            "흑임자 호박떡은 한 번쯤 먹어볼 만한 맛이었습니다",
            "📍오복떡집 주소: 서울 성동구 성덕정길 32 매달 1, 3번째 화요일 정기휴무",
            "#서울맛집 #성수맛집 #성수떡집 #떡맛집 #떡집");

    private static final String CAROUSEL_URL =
            "https://www.instagram.com/p/CzXgv-6SaFZ/";
    private static final String CAROUSEL_FULL_CAPTION = String.join(" ",
            "#송화산시도삭면",
            "탱탱쫄깃한 도삭면과 육즙 가득한 딤섬 맛집",
            "면 반죽을 칼로 썰어 넣어서 도삭면이라는 이름을 가졌다",
            "칼국수 보다 도톰한 면발에 진한 육수 한입",
            "고기 한점까지 먹으면 맥주가 술술 들어간다",
            "쇼우롱포는 육즙이 너무 많아서",
            "입안에서 고기 맛이 오래 남는다",
            "⚡️도삭면 9000원, 쇼우롱포 8000원",
            "⚡️서울 광진구 뚝섬로27길 48",
            "#건대맛집 #건대 #건대입구 #중식 #광진구맛집");

    private final RestClient restClient = RestClient.create();
    private final InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(restClient);

    @Test
    void 첫번째_릴스의_태그에서_작성자_전체_캡션_썸네일을_가져온다() {
        // given
        InstagramUrl instagramUrl = new InstagramUrl(REEL_URL);

        // when
        MediaMetadataWithUrl metadata = reader.read(instagramUrl);
        URI thumbnailUrl = URI.create(metadata.thumbnailUrl());

        // then
        assertAll(
                () -> assertThat(metadata.author()).isEqualTo("shyrilla__"),
                () -> assertThat(thumbnailUrl.getScheme()).isEqualTo("https"),
                () -> assertThat(thumbnailUrl.getHost()).contains("cdninstagram.com"),
                () -> assertThat(thumbnailUrl.getRawPath()).endsWith(".jpg"),
                () -> assertThat(thumbnailUrl.getRawQuery()).contains("oh=", "oe="),
                () -> assertThat(metadata.thumbnailUrl()).doesNotContain("&amp;"),
                () -> assertThat(metadata.caption().strip().replaceAll("\\s+", " "))
                        .contains(FULL_CAPTION)
        );
    }

    @Test
    void 캐러셀_게시물의_태그에서_작성자_전체_캡션_썸네일을_가져온다() {
        // given
        InstagramUrl instagramUrl = new InstagramUrl(CAROUSEL_URL);

        // when
        MediaMetadataWithUrl metadata = reader.read(instagramUrl);
        URI thumbnailUrl = URI.create(metadata.thumbnailUrl());
        String normalizedCaption = String.valueOf(metadata.caption()).strip().replaceAll("\\s+", " ");

        // then
        assertAll(
                () -> assertThat(metadata.author()).isEqualTo("mugglekundae"),
                () -> assertThat(thumbnailUrl.getHost()).contains("cdninstagram.com"),
                () -> assertThat(thumbnailUrl.getRawPath())
                        .endsWith("/653922247_18081073304073059_4744466162535269226_n.webp"),
                () -> assertThat(thumbnailUrl.getRawQuery()).contains("oh=", "oe="),
                () -> assertThat(normalizedCaption).contains(CAROUSEL_FULL_CAPTION)
        );
    }

    @Test
    void 인스타그램_페이지_요청이_HTTP_오류로_실패하면_콘텐츠_사용_불가_예외를_던진다() {
        // given
        RestClient.Builder restClientBuilder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restClientBuilder).build();
        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(restClientBuilder.build());
        server.expect(requestTo(REEL_URL))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        // when & then
        assertThatThrownBy(() -> reader.read(new InstagramUrl(REEL_URL)))
                .isInstanceOf(InstagramContentUnavailableException.class)
                .hasCauseInstanceOf(RestClientException.class);
        server.verify();
    }

    @Test
    void HTML_응답이_비어_있으면_콘텐츠_사용_불가_예외를_던진다() {
        // given
        RestClient.Builder restClientBuilder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restClientBuilder).build();
        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(restClientBuilder.build());
        server.expect(requestTo(REEL_URL))
                .andRespond(withSuccess("", MediaType.TEXT_HTML));

        // when & then
        assertThatThrownBy(() -> reader.read(new InstagramUrl(REEL_URL)))
                .isInstanceOf(InstagramContentUnavailableException.class);
        server.verify();
    }

    @Test
    void 캐러셀은_embed_페이지의_원본_비율_이미지를_우선_사용한다() {
        // given
        String carouselUrl = "https://www.instagram.com/p/carousel-original/";
        String embedUrl = "https://www.instagram.com/p/carousel-original/embed/";
        RestClient.Builder restClientBuilder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restClientBuilder).build();
        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(restClientBuilder.build());
        server.expect(requestTo(carouselUrl))
                .andRespond(withSuccess(metadataHtml(), MediaType.TEXT_HTML));
        server.expect(requestTo(embedUrl))
                .andRespond(withSuccess("""
                        <script>data = "{\\\"display_url\\\":\\\"https:\\/\\/scontent.cdninstagram.com\\/original.jpg\\\"}";</script>
                        """, MediaType.TEXT_HTML));

        // when
        MediaMetadataWithUrl metadata = reader.read(new InstagramUrl(carouselUrl));

        // then
        assertThat(metadata.thumbnailUrl()).isEqualTo("https://scontent.cdninstagram.com/original.jpg");
        server.verify();
    }

    @Test
    void 캐러셀_embed_이미지를_가져오지_못하면_메타_태그_이미지를_사용한다() {
        // given
        String carouselUrl = "https://www.instagram.com/p/carousel-fallback/";
        String embedUrl = "https://www.instagram.com/p/carousel-fallback/embed/";
        RestClient.Builder restClientBuilder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restClientBuilder).build();
        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(restClientBuilder.build());
        server.expect(requestTo(carouselUrl))
                .andRespond(withSuccess(metadataHtml(), MediaType.TEXT_HTML));
        server.expect(requestTo(embedUrl))
                .andRespond(withStatus(HttpStatus.FORBIDDEN));

        // when
        MediaMetadataWithUrl metadata = reader.read(new InstagramUrl(carouselUrl));

        // then
        assertThat(metadata.thumbnailUrl()).isEqualTo("https://scontent.cdninstagram.com/fallback.jpg");
        server.verify();
    }

    private String metadataHtml() {
        return """
                <meta property="og:image" content="https://scontent.cdninstagram.com/fallback.jpg">
                <meta name="twitter:image" content="https://scontent.cdninstagram.com/fallback.jpg">
                """;
    }
}
