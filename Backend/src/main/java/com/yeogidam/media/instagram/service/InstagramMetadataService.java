package com.yeogidam.media.instagram.service;

import com.yeogidam.media.extraction.logging.ExtractionTimeline;
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
        MediaMetadataWithUrl mediaMetadataWithUrl = instagramMediaHtmlReader.read(instagramUrl);
        ExtractionTimeline.instagramRead();
        String thumbnailKey = storeThumbnail(instagramUrl, mediaMetadataWithUrl.thumbnailUrl());
        ExtractionTimeline.thumbnailStored();
        MediaMetadata mediaMetadata = new MediaMetadata(
                mediaMetadataWithUrl.caption(),
                thumbnailKey,
                mediaMetadataWithUrl.author());
        instagramMediaMetadataWriter.updateMetadata(mediaId, mediaMetadata);
        // 캡션이 비어 실패하는 게시물도 썸네일은 이미 카드에 보이므로, 캡션 검사 전에 남긴다.
        ExtractionTimeline.metadataStored();
        if (isMissingCaption(mediaMetadataWithUrl.caption())) {
            throw new InstagramContentUnavailableException("인스타그램 게시물 설명을 찾지 못했습니다.");
        }
        return mediaMetadata;
    }

    private String storeThumbnail(InstagramUrl instagramUrl, String thumbnailUrl) {
        if (thumbnailUrl == null || thumbnailUrl.isBlank()) {
            return null;
        }
        return instagramThumbnailStore.store(instagramUrl.getMediaShortcode(), thumbnailUrl);
    }

    private boolean isMissingCaption(String caption) {
        return caption == null || caption.isBlank();
    }
}
