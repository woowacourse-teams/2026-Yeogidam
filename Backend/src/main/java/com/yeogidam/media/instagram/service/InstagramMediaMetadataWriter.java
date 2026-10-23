package com.yeogidam.media.instagram.service;

import com.yeogidam.media.instagram.domain.MediaMetadata;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class InstagramMediaMetadataWriter {

    private final InstagramMediaDao instagramMediaDao;

    @Transactional
    public void updateMetadata(Long mediaId, MediaMetadata metadata) {
        instagramMediaDao.updateMetadata(mediaId, metadata);
    }
}
