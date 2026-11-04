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
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * InstagramMediaHtmlReader를 고쳐도 인스타그램 게시물 페이지에서 작성자, 캡션, 썸네일을 읽는 결과가 그대로인지 확인한다.
 * 응답으로 2026-11-02에 받은 실제 응답을 잘라 둔 src/test/resources/instagram의 HTML 파일을 쓰므로,
 * 인스타그램이 형식을 바꾸거나 게시물을 지워도 테스트 결과는 달라지지 않는다.
 * HTML 파일에는 InstagramMediaHtmlReader가 읽는 부분만 글자 그대로 남겼다(게시물 페이지는 메타 태그 전부,
 * embed 페이지는 첫 display_url).
 */
class InstagramMediaHtmlReaderTest {

    private static final String REEL_URL =
            "https://www.instagram.com/reel/DRrDF4SkZB_/";
    private static final String REEL_CAPTION =
            "862 likes, 42 comments - bigbrowoosung - November 29, 2025: \"수완지구에 기가 막힌 쌈밥집 생김!!!\".";
    private static final String REEL_THUMBNAIL_URL = "https://scontent-icn2-1.cdninstagram.com/v/t51.82787-15/"
            + "590408568_17872709652461565_1607573965792622300_n.jpg?stp=cmp1_dst-jpg_e35_s640x640_tt6&_nc_cat=106"
            + "&ccb=7-5&_nc_sid=18de74&efg=eyJlZmdfdGFnIjoiQ0xJUFMuYmVzdF9pbWFnZV91cmxnZW4uQzMifQ%3D%3D"
            + "&_nc_ohc=F3NTocqGC98Q7kNvwEK8DO4"
            + "&_nc_oc=AdolX-KAFu_3l8TCnJ6m8UjjlKB2y6SG7P7ydHNlFDt6bdIHSQTjNaZA4ZgDbtbTKxE&_nc_zt=23"
            + "&_nc_ht=scontent-icn2-1.cdninstagram.com&_nc_gid=7eT__Ibls0ziu6inhywkAw&_nc_ss=7060f"
            + "&oh=00_AQT7t4qd-1WAHtEj0YMF24Cn85NIWBqDm0JOg9unfaOmig&oe=6AEE356E";

    private static final String CAROUSEL_URL =
            "https://www.instagram.com/p/CzXgv-6SaFZ/";
    private static final String CAROUSEL_EMBED_URL =
            "https://www.instagram.com/p/CzXgv-6SaFZ/embed/";
    private static final String CAROUSEL_CAPTION = """
            182 likes, 34 comments - mugglekundae - November 7, 2023: "#송화산시도삭면
            탱탱쫄깃한 도삭면과 육즙 가득한 딤섬 맛집

            면 반죽을 칼로 썰어 넣어서 도삭면이라는 이름을 가졌다
            칼국수 보다 도톰한 면발에 진한 육수 한입
            고기 한점까지 먹으면 맥주가 술술 들어간다

            쇼우롱포는 육즙이 너무 많아서
            입안에서 고기 맛이 오래 남는다

            ⚡️도삭면 9000원, 쇼우롱포 8000원
            ⚡️서울 광진구 뚝섬로27길 48

            #건대맛집 #건대 #건대입구 #중식 #광진구맛집".""";
    private static final String CAROUSEL_EMBED_IMAGE_URL = "https://scontent-icn2-1.cdninstagram.com/v/t51.82787-15/"
            + "653922247_18081073304073059_4744466162535269226_n.webp?_nc_cat=109"
            + "&ig_cache_key=MzIzMTE5NTI4NjEzOTgzNTE2Ng%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad"
            + "&efg=eyJ2ZW5jb2RlX3RhZyI6IkNBUk9VU0VMX0lURU0ueHBpZHMuMTQ0MC5zZHIucmVndWxhcl9waG90by5DMyJ9"
            + "&_nc_ohc=iL8qTspxoywQ7kNvwGVcta9"
            + "&_nc_oc=AdoWEylhHHqpH4viBxID0hJCiNXjsGvXFDdPyaL5D5MCGmYqBEKvMn1Ht5IZGobgDuY&_nc_zt=23"
            + "&_nc_ht=scontent-icn2-1.cdninstagram.com&_nc_gid=M6aUmWkWy-YNr9_8pxSyKg&_nc_ss=7060f"
            + "&oh=00_AQSBK9k4Gsnp7hpurubd96z92a-KwIrOPtb9Emgk0VandA&oe=6AEE3F85";

    private static final String DELETED_REEL_URL =
            "https://www.instagram.com/reel/DZhRsDGgdVs/";
    private static final MediaType TEXT_HTML_UTF8 = new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8);

    @Test
    void 릴스_메타_태그에서_작성자_캡션_썸네일을_가져온다() throws IOException {
        // given
        RestClient.Builder restClientBuilder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restClientBuilder).build();
        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(restClientBuilder.build());
        server.expect(requestTo(REEL_URL))
                .andRespond(withSuccess(readFixture("reel-page.html"), TEXT_HTML_UTF8));

        // when
        MediaMetadataWithUrl metadata = reader.read(new InstagramUrl(REEL_URL));

        // then
        assertAll(
                () -> assertThat(metadata.author()).isEqualTo("bigbrowoosung"),
                () -> assertThat(metadata.caption()).isEqualTo(REEL_CAPTION),
                () -> assertThat(metadata.thumbnailUrl()).isEqualTo(REEL_THUMBNAIL_URL)
        );
        server.verify();
    }

    @Test
    void 캐러셀_게시물에서_작성자_전체_캡션_embed_원본_비율_썸네일을_가져온다() throws IOException {
        // given
        RestClient.Builder restClientBuilder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restClientBuilder).build();
        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(restClientBuilder.build());
        server.expect(requestTo(CAROUSEL_URL))
                .andRespond(withSuccess(readFixture("carousel-page.html"), TEXT_HTML_UTF8));
        server.expect(requestTo(CAROUSEL_EMBED_URL))
                .andRespond(withSuccess(readFixture("carousel-embed.html"), TEXT_HTML_UTF8));

        // when
        MediaMetadataWithUrl metadata = reader.read(new InstagramUrl(CAROUSEL_URL));

        // then
        assertAll(
                () -> assertThat(metadata.author()).isEqualTo("mugglekundae"),
                () -> assertThat(metadata.caption()).isEqualTo(CAROUSEL_CAPTION),
                () -> assertThat(metadata.thumbnailUrl()).isEqualTo(CAROUSEL_EMBED_IMAGE_URL)
        );
        server.verify();
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
    void 삭제된_게시물의_오류_페이지를_받으면_작성자_캡션_썸네일을_모두_null로_돌려준다() throws IOException {
        // given
        RestClient.Builder restClientBuilder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restClientBuilder).build();
        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(restClientBuilder.build());
        server.expect(requestTo(DELETED_REEL_URL))
                .andRespond(withSuccess(readFixture("deleted-reel-page.html"), TEXT_HTML_UTF8));

        // when
        MediaMetadataWithUrl metadata = reader.read(new InstagramUrl(DELETED_REEL_URL));

        // then
        assertAll(
                () -> assertThat(metadata.author()).isNull(),
                () -> assertThat(metadata.caption()).isNull(),
                () -> assertThat(metadata.thumbnailUrl()).isNull()
        );
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

    private String readFixture(String fileName) throws IOException {
        return new ClassPathResource("instagram/" + fileName).getContentAsString(StandardCharsets.UTF_8);
    }
}
