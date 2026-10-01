package com.yeogidam.media.share.service;

import com.yeogidam.media.extraction.config.ExtractionProperties;
import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.instagram.domain.InstagramMedia;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.media.share.domain.SharedInstagramMedia;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.dto.response.PlaceCandidateResponses;
import com.yeogidam.media.share.dto.response.ShareHistoryItemResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import com.yeogidam.media.share.repository.PlaceCandidateDao;
import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.ShareHistoryProjection;
import com.yeogidam.media.share.repository.SharedMediaDao;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    private final MediaThumbnailUrlResolver mediaThumbnailUrlResolver;

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
        List<ShareHistoryResponse> responses = history.stream()
                .map(projection -> {
                    String instagramThumbnailUrl = mediaThumbnailUrlResolver.resolve(projection.thumbnailKey());
                    return ShareHistoryResponse.from(projection, instagramThumbnailUrl);
                })
                .toList();
        return ShareHistoryResponses.from(responses);
    }

    public PlaceCandidateResponses readShareHistoryPlaces(Long memberId, Long sharedMediaId) {
        if (!sharedMediaDao.existsByMemberIdAndSharedMediaId(memberId, sharedMediaId)) {
            throw new MediaException(MediaErrorCode.SHARED_MEDIA_NOT_FOUND);
        }
        List<PlaceCandidateProjection> candidates = placeCandidateDao.findCandidates(sharedMediaId);
        Map<Long, String> placeThumbnailUrls = resolvePlaceThumbnailUrls(candidates);
        return PlaceCandidateResponses.from(candidates, placeThumbnailUrls);
    }

    private Map<Long, String> resolvePlaceThumbnailUrls(List<PlaceCandidateProjection> candidates) {
        Map<Long, String> placeThumbnailUrls = new HashMap<>();
        for (PlaceCandidateProjection candidate : candidates) {
            String placeThumbnailUrl = mediaThumbnailUrlResolver.resolve(candidate.thumbnailKey());
            placeThumbnailUrls.put(candidate.placeId(), placeThumbnailUrl);
        }
        return placeThumbnailUrls;
    }

    public ShareHistoryItemResponse readShareHistoryItem(Long memberId, Long sharedMediaId) {
        ShareHistoryProjection sharedMedia = sharedMediaDao.findShareHistoryItem(memberId, sharedMediaId)
                .orElseThrow(() -> new MediaException(MediaErrorCode.SHARED_MEDIA_NOT_FOUND));
        String instagramThumbnailUrl = mediaThumbnailUrlResolver.resolve(sharedMedia.thumbnailKey());
        return ShareHistoryItemResponse.from(sharedMedia, instagramThumbnailUrl);
    }
}
