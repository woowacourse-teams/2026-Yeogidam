package com.yeogidam.media.share.service;

import com.yeogidam.media.extraction.config.ExtractionProperties;
import com.yeogidam.media.instagram.domain.InstagramMedia;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.media.share.domain.SharedInstagramMedia;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.dto.response.PlaceCandidateResponses;
import com.yeogidam.media.share.dto.response.ShareHistoryItemResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import com.yeogidam.media.share.exception.ShareErrorCode;
import com.yeogidam.media.share.exception.ShareException;
import com.yeogidam.media.share.repository.PlaceCandidateDao;
import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.ShareHistoryProjection;
import com.yeogidam.media.share.repository.SharedMediaDao;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ShareService {

    private final SharedMediaDao sharedMediaDao;
    private final PlaceCandidateDao placeCandidateDao;
    private final InstagramMediaDao instagramMediaDao;
    private final ExtractionProperties extractionProperties;

    @Transactional
    public void createShare(Long memberId, ShareRequest rawInstagramUrl) {
        InstagramUrl instagramUrl = new InstagramUrl(rawInstagramUrl.instagramUrl());
        Long mediaId = getOrCreateMediaId(instagramUrl.getMediaShortcode());
        createSharedMedia(memberId, mediaId, instagramUrl);
    }

    private Long getOrCreateMediaId(MediaShortcode shortcode) {
        Optional<Long> existingMediaId = instagramMediaDao.findIdByShortcode(shortcode);
        if (existingMediaId.isPresent()) {
            return existingMediaId.get();
        }
        InstagramMedia instagramMedia = new InstagramMedia(shortcode);
        try {
            return instagramMediaDao.save(instagramMedia, extractionProperties.pipelineVersion());
        } catch (DuplicateKeyException exception) {
            return instagramMediaDao.findIdByShortcodeForUpdate(shortcode)
                    .orElseThrow(() -> new IllegalStateException("게시물을 찾을 수 없습니다.", exception));
        }
    }

    private void createSharedMedia(Long memberId, Long mediaId, InstagramUrl instagramUrl) {
        SharedInstagramMedia sharedInstagramMedia = new SharedInstagramMedia(memberId, mediaId, instagramUrl);
        sharedMediaDao.save(sharedInstagramMedia);
    }

    public ShareHistoryResponses readShareHistory(Long memberId) {
        List<ShareHistoryProjection> history = sharedMediaDao.findShareHistory(memberId);
        return ShareHistoryResponses.from(history);
    }

    public PlaceCandidateResponses readShareHistoryPlaces(Long memberId, Long sharedMediaId) {
        if (!sharedMediaDao.existsByMemberIdAndSharedMediaId(memberId, sharedMediaId)) {
            throw new ShareException(ShareErrorCode.NOT_FOUND);
        }
        List<PlaceCandidateProjection> candidates = placeCandidateDao.findCandidates(sharedMediaId);
        return PlaceCandidateResponses.from(candidates);
    }

    public ShareHistoryItemResponse readShareHistoryItem(Long memberId, Long sharedMediaId) {
        ShareHistoryProjection sharedMedia = sharedMediaDao.findShareHistoryItem(memberId, sharedMediaId)
                .orElseThrow(() -> new ShareException(ShareErrorCode.NOT_FOUND));
        return ShareHistoryItemResponse.from(sharedMedia);
    }
}
