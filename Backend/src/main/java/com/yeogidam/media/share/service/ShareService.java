package com.yeogidam.media.share.service;

import com.yeogidam.media.extraction.config.ExtractionProperties;
import com.yeogidam.media.extraction.service.MediaExtractionDispatcher;
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
import com.yeogidam.media.share.repository.ShareHistoryCursor;
import com.yeogidam.media.share.repository.ShareHistoryProjection;
import com.yeogidam.media.share.repository.ShareHistoryProjections;
import com.yeogidam.media.share.repository.SharedMediaDao;
import java.time.Instant;
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
    private final MediaExtractionDispatcher mediaExtractionDispatcher;

    @Transactional
    public void createShare(Long memberId, ShareRequest rawInstagramUrl) {
        InstagramUrl instagramUrl = new InstagramUrl(rawInstagramUrl.instagramUrl());
        Long mediaId = getOrCreateMediaId(instagramUrl.getMediaShortcode(), instagramUrl);
        placeCandidateDao.supersedeUndecided(memberId, mediaId);
        Long sharedMediaId = createSharedMedia(memberId, mediaId, instagramUrl);
        placeCandidateDao.issueForShare(sharedMediaId, mediaId);
    }

    private Long getOrCreateMediaId(MediaShortcode shortcode, InstagramUrl instagramUrl) {
        Optional<Long> existingMediaId = instagramMediaDao.findIdByShortcodeForUpdate(shortcode);
        if (existingMediaId.isPresent()) {
            Long mediaId = existingMediaId.get();
            retryMediaIfNeeded(mediaId, instagramUrl);
            return mediaId;
        }

        InstagramMedia instagramMedia = new InstagramMedia(shortcode);
        try {
            Long mediaId = instagramMediaDao.save(instagramMedia, extractionProperties.pipelineVersion());
            mediaExtractionDispatcher.dispatchAfterCommit(mediaId, instagramUrl);
            return mediaId;
        } catch (DuplicateKeyException exception) {
            return instagramMediaDao.findIdByShortcode(shortcode)
                    .orElseThrow(() -> new IllegalStateException("게시물을 찾을 수 없습니다.", exception));
        }
    }

    private void retryMediaIfNeeded(Long mediaId, InstagramUrl instagramUrl) {
        int pipelineVersion = extractionProperties.pipelineVersion();
        boolean retryStarted = instagramMediaDao.retryFailedExtractionIfEligible(mediaId, pipelineVersion);
        if (retryStarted) {
            mediaExtractionDispatcher.dispatchAfterCommit(mediaId, instagramUrl);
        }
    }

    private Long createSharedMedia(Long memberId, Long mediaId, InstagramUrl instagramUrl) {
        SharedInstagramMedia sharedInstagramMedia = new SharedInstagramMedia(memberId, mediaId, instagramUrl);
        return sharedMediaDao.save(sharedInstagramMedia);
    }

    public ShareHistoryResponses readShareHistory(
            Long memberId,
            Instant cursorCreatedAt,
            Long cursorId
    ) {
        ShareHistoryProjections history = findShareHistory(memberId, cursorCreatedAt, cursorId);
        List<ShareHistoryResponse> responses = history.page()
                .stream()
                .map(projection -> {
                    String instagramThumbnailUrl = mediaThumbnailUrlResolver.resolve(projection.thumbnailKey());
                    return ShareHistoryResponse.from(projection, instagramThumbnailUrl);
                })
                .toList();
        return ShareHistoryResponses.from(responses, history.nextCursor());
    }

    private ShareHistoryProjections findShareHistory(
            Long memberId,
            Instant cursorCreatedAt,
            Long cursorId
    ) {
        if (cursorCreatedAt == null && cursorId == null) {
            return sharedMediaDao.findShareHistory(memberId);
        }
        if (cursorCreatedAt == null || cursorId == null) {
            throw new MediaException(MediaErrorCode.INCOMPLETE_HISTORY_CURSOR);
        }
        return sharedMediaDao.findShareHistoryBefore(memberId, new ShareHistoryCursor(cursorCreatedAt, cursorId));
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
