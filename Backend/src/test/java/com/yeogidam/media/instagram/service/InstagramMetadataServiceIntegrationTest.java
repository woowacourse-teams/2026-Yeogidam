package com.yeogidam.media.instagram.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadataWithUrl;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import com.yeogidam.media.instagram.exception.InstagramContentUnavailableException;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaHtmlReader;
import com.yeogidam.media.instagram.infrastructure.InstagramThumbnailStore;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.support.JdbcTestSupport;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestClient;

@Import(InstagramMediaDao.class)
class InstagramMetadataServiceIntegrationTest extends JdbcTestSupport {

    private static final Long MEDIA_ID = 701L;
    private static final String SHORTCODE = "CzXgv-6SaFZ";
    private static final String INSTAGRAM_URL = "https://www.instagram.com/p/CzXgv-6SaFZ/";
    private static final String INSTAGRAM_THUMBNAIL_URL =
            "https://scontent.cdninstagram.com/image.webp?signature=expires";
    private static final String S3_OBJECT_KEY = "yeogidam/instagram-thumbnails/CzXgv-6SaFZ.jpg";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private InstagramMediaDao instagramMediaDao;

    @Test
    void 인스타그램_썸네일을_저장하면_저장소가_반환한_객체_키를_DB에_저장한다() {
        // given
        insertMedia();
        MediaMetadataWithUrl pageMetadata = new MediaMetadataWithUrl("캡션", INSTAGRAM_THUMBNAIL_URL, "yeogidam");
        FakeInstagramMediaHtmlReader instagramMediaHtmlReader = new FakeInstagramMediaHtmlReader(pageMetadata);
        FakeInstagramThumbnailStore thumbnailStore = new FakeInstagramThumbnailStore(S3_OBJECT_KEY);
        InstagramMediaMetadataWriter metadataWriter = new InstagramMediaMetadataWriter(instagramMediaDao);
        InstagramMetadataService service = new InstagramMetadataService(
                instagramMediaHtmlReader,
                thumbnailStore,
                metadataWriter);

        // when
        service.readAndStore(MEDIA_ID, new InstagramUrl(INSTAGRAM_URL));

        // then
        var storedMetadata = jdbcTemplate.queryForMap(
                "SELECT caption, thumbnail_key, author FROM media WHERE id = ?",
                MEDIA_ID);
        assertAll(
                () -> assertThat(thumbnailStore.shortcode()).isEqualTo(new MediaShortcode(SHORTCODE)),
                () -> assertThat(thumbnailStore.sourceUrl()).isEqualTo(INSTAGRAM_THUMBNAIL_URL),
                () -> assertThat(storedMetadata.get("caption")).isEqualTo("캡션"),
                () -> assertThat(storedMetadata.get("thumbnail_key")).isEqualTo(S3_OBJECT_KEY),
                () -> assertThat(storedMetadata.get("author")).isEqualTo("yeogidam")
        );
    }

    @Test
    void 썸네일_저장에_실패해도_메타데이터를_저장하고_추출_상태를_실패로_바꾸지_않는다() {
        // given
        insertMedia();
        MediaMetadataWithUrl pageMetadata = new MediaMetadataWithUrl("캡션", INSTAGRAM_THUMBNAIL_URL, "yeogidam");
        FakeInstagramMediaHtmlReader instagramMediaHtmlReader = new FakeInstagramMediaHtmlReader(pageMetadata);
        InstagramThumbnailStore instagramThumbnailStore = (shortcode, sourceUrl) -> null;
        InstagramMediaMetadataWriter metadataWriter = new InstagramMediaMetadataWriter(instagramMediaDao);
        InstagramMetadataService service = new InstagramMetadataService(
                instagramMediaHtmlReader,
                instagramThumbnailStore,
                metadataWriter);

        // when
        service.readAndStore(MEDIA_ID, new InstagramUrl(INSTAGRAM_URL));

        // then
        var storedMetadata = jdbcTemplate.queryForMap(
                "SELECT caption, thumbnail_key, author, extraction_status, failure_reason FROM media WHERE id = ?",
                MEDIA_ID);
        assertAll(
                () -> assertThat(storedMetadata.get("caption")).isEqualTo("캡션"),
                () -> assertThat(storedMetadata.get("thumbnail_key")).isNull(),
                () -> assertThat(storedMetadata.get("author")).isEqualTo("yeogidam"),
                () -> assertThat(storedMetadata.get("extraction_status")).isEqualTo("EXTRACTING"),
                () -> assertThat(storedMetadata.get("failure_reason")).isNull()
        );
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = " ")
    void 캡션이_없거나_공백이면_썸네일_등_확인한_메타데이터를_저장한_뒤_콘텐츠_사용_불가_예외를_던진다(
            String caption
    ) {
        // given
        insertMedia();
        MediaMetadataWithUrl mediaMetadataWithUrl = new MediaMetadataWithUrl(caption, INSTAGRAM_THUMBNAIL_URL, "yeogidam");
        FakeInstagramMediaHtmlReader instagramMediaHtmlReader = new FakeInstagramMediaHtmlReader(mediaMetadataWithUrl);
        FakeInstagramThumbnailStore thumbnailStore = new FakeInstagramThumbnailStore(S3_OBJECT_KEY);
        InstagramMetadataService service = createService(instagramMediaHtmlReader, thumbnailStore);

        // when & then
        assertThatThrownBy(() -> service.readAndStore(MEDIA_ID, new InstagramUrl(INSTAGRAM_URL)))
                .isInstanceOf(InstagramContentUnavailableException.class);

        var storedMetadata = jdbcTemplate.queryForMap(
                "SELECT caption, thumbnail_key, author, extraction_status FROM media WHERE id = ?",
                MEDIA_ID);
        assertAll(
                () -> assertThat(storedMetadata.get("caption")).isEqualTo(caption),
                () -> assertThat(storedMetadata.get("thumbnail_key")).isEqualTo(S3_OBJECT_KEY),
                () -> assertThat(storedMetadata.get("author")).isEqualTo("yeogidam"),
                () -> assertThat(storedMetadata.get("extraction_status")).isEqualTo("EXTRACTING")
        );
    }

    private InstagramMetadataService createService(
            InstagramMediaHtmlReader instagramMediaHtmlReader,
            InstagramThumbnailStore instagramThumbnailStore
    ) {
        InstagramMediaMetadataWriter metadataWriter = new InstagramMediaMetadataWriter(instagramMediaDao);
        return new InstagramMetadataService(instagramMediaHtmlReader, instagramThumbnailStore, metadataWriter);
    }

    private static class FakeInstagramMediaHtmlReader extends InstagramMediaHtmlReader {

        private final MediaMetadataWithUrl mediaMetadataWithUrl;

        private FakeInstagramMediaHtmlReader(MediaMetadataWithUrl mediaMetadataWithUrl) {
            super(RestClient.create());
            this.mediaMetadataWithUrl = mediaMetadataWithUrl;
        }

        @Override
        public MediaMetadataWithUrl read(InstagramUrl instagramUrl) {
            return mediaMetadataWithUrl;
        }
    }

    private void insertMedia() {
        jdbcTemplate.update("""
                INSERT INTO media (
                    id, media_shortcode, caption, thumbnail_key, author,
                    extraction_status, extraction_version, source_type
                )
                VALUES (?, ?, NULL, NULL, NULL, 'EXTRACTING', 1, 'EXTRACTED')
                """, MEDIA_ID, SHORTCODE);
    }


    private static class FakeInstagramThumbnailStore implements InstagramThumbnailStore {

        private final String objectKey;

        private MediaShortcode shortcode;
        private String sourceUrl;

        private FakeInstagramThumbnailStore(String objectKey) {
            this.objectKey = objectKey;
        }

        @Override
        public String store(MediaShortcode shortcode, String sourceUrl) {
            this.shortcode = shortcode;
            this.sourceUrl = sourceUrl;

            return objectKey;
        }

        private MediaShortcode shortcode() {
            return shortcode;
        }

        private String sourceUrl() {
            return sourceUrl;
        }
    }
}
