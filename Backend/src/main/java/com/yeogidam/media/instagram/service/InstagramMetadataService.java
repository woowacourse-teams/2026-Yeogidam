package com.yeogidam.media.instagram.service;

import com.yeogidam.media.extraction.domain.ExtractionReport;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadata;
import com.yeogidam.media.instagram.domain.MediaMetadataWithUrl;
import com.yeogidam.media.instagram.exception.InstagramContentUnavailableException;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaHtmlReader;
import com.yeogidam.media.instagram.infrastructure.InstagramThumbnailStore;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class InstagramMetadataService {

    private final InstagramMediaHtmlReader instagramMediaHtmlReader;
    private final InstagramThumbnailStore instagramThumbnailStore;
    private final InstagramMediaMetadataWriter instagramMediaMetadataWriter;

    public MediaMetadata readAndStore(Long mediaId, InstagramUrl instagramUrl) {
        return readAndStore(mediaId, instagramUrl, new ExtractionReport());
    }

    public MediaMetadata readAndStore(
            Long mediaId,
            InstagramUrl instagramUrl,
            ExtractionReport report
    ) {
        MediaMetadataWithUrl mediaMetadataWithUrl = instagramMediaHtmlReader.read(instagramUrl);
        String thumbnailKey = storeThumbnail(instagramUrl, mediaMetadataWithUrl.thumbnailUrl(), report);
        MediaMetadata mediaMetadata = new MediaMetadata(
                mediaMetadataWithUrl.caption(),
                thumbnailKey,
                mediaMetadataWithUrl.author());
        report.enterStage("METADATA_STORE");
        instagramMediaMetadataWriter.updateMetadata(mediaId, mediaMetadata);
        report.enterStage("CAPTION_VALIDATE");
        if (isMissingCaption(mediaMetadataWithUrl.caption())) {
            throw new InstagramContentUnavailableException("인스타그램 게시물 설명을 찾지 못했습니다.");
        }
        return mediaMetadata;
    }

    private String storeThumbnail(
            InstagramUrl instagramUrl,
            String thumbnailUrl,
            ExtractionReport report
    ) {
        if (thumbnailUrl == null || thumbnailUrl.isBlank()) {
            return null;
        }
        report.enterStage("CONTENT_THUMBNAIL");
        return instagramThumbnailStore.store(instagramUrl.getMediaShortcode(), thumbnailUrl);
    }

    private boolean isMissingCaption(String caption) {
        return caption == null || caption.isBlank();
    }
}
