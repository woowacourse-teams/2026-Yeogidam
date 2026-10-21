package com.yeogidam.support.fake;

import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadataWithUrl;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaHtmlReader;
import com.yeogidam.media.instagram.infrastructure.InstagramThumbnailStore;
import com.yeogidam.place.infrastructure.KakaoPlaceMetaReader;
import java.net.http.HttpClient;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.web.client.RestClient;

@TestConfiguration
public class FakeMediaExtractionConfig {

    private static final String THUMBNAIL_KEY = "yeogidam/instagram-thumbnails/pipeline-2026.jpg";

    @Bean
    @Primary
    public FakeInstagramMediaHtmlReader fakeInstagramMediaHtmlReader() {
        return new FakeInstagramMediaHtmlReader();
    }

    @Bean
    @Primary
    public InstagramThumbnailStore fakeThumbnailStore() {
        return (shortcode, sourceUrl) -> THUMBNAIL_KEY;
    }

    @Bean
    @Primary
    public KakaoPlaceMetaReader fakeKakaoPlaceMetaReader(HttpClient httpClient) {
        return new FakeKakaoPlaceMetaReader(httpClient);
    }

    @Bean
    @Primary
    public FakePlaceNameExtractor fakePlaceNameExtractor() {
        return new FakePlaceNameExtractor();
    }

    @Bean
    @Primary
    public FakePlaceSearcher fakePlaceSearcher() {
        return new FakePlaceSearcher();
    }

    private static class FakeKakaoPlaceMetaReader extends KakaoPlaceMetaReader {

        private FakeKakaoPlaceMetaReader(HttpClient httpClient) {
            super(httpClient);
        }

        @Override
        public String readMainPhotoUrl(String placeId) {
            return null;
        }
    }

    public static class FakeInstagramMediaHtmlReader extends InstagramMediaHtmlReader {

        private final AtomicReference<String> author = new AtomicReference<>("yeogidam");
        private final AtomicReference<RuntimeException> failure = new AtomicReference<>();

        private FakeInstagramMediaHtmlReader() {
            super(RestClient.create());
        }

        public void respondWithAuthor(String value) {
            author.set(value);
        }

        public void failWith(RuntimeException exception) {
            failure.set(exception);
        }

        @Override
        public MediaMetadataWithUrl read(InstagramUrl instagramUrl) {
            if (failure.get() != null) {
                throw failure.get();
            }
            return new MediaMetadataWithUrl("올드빅과 Dub.+에 다녀왔어요",
                    "https://instagram.example.com/thumbnail.jpg", author.get());
        }
    }
}
