package com.yeogidam.media.share.service;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.config.ExtractionProperties;
import com.yeogidam.media.extraction.domain.ExtractionSnapshot;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.extraction.repository.MediaPlaceDao;
import com.yeogidam.media.extraction.repository.MediaPlaceProjection;
import com.yeogidam.media.extraction.service.MediaExtractionDispatcher;
import com.yeogidam.media.instagram.domain.InstagramMedia;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.media.share.domain.ExtractionRetrySource;
import com.yeogidam.media.share.domain.SharedInstagramMedia;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.dto.response.ExtractionRetryResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryPlaceResponses;
import com.yeogidam.media.share.dto.response.ShareHistoryResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import com.yeogidam.media.share.repository.ShareHistoryCursor;
import com.yeogidam.media.share.repository.ShareHistoryProjections;
import com.yeogidam.media.share.repository.SharedMediaDao;
import com.yeogidam.place.service.SavedPlaceRegistrationService;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ShareService {

    private final MediaPlaceDao mediaPlaceDao;
    private final SharedMediaDao sharedMediaDao;
    private final InstagramMediaDao instagramMediaDao;
    private final ExtractionProperties extractionProperties;
    private final MediaThumbnailUrlResolver mediaThumbnailUrlResolver;
    private final MediaExtractionDispatcher mediaExtractionDispatcher;
    private final SavedPlaceRegistrationService savedPlaceRegistrationService;

    @Transactional
    public void createShare(Long memberId, ShareRequest rawInstagramUrl) {
        InstagramUrl instagramUrl = new InstagramUrl(rawInstagramUrl.instagramUrl());
        Long mediaId = getOrCreateMediaId(instagramUrl.getMediaShortcode(), instagramUrl);
        Long sharedMediaId = createSharedMedia(memberId, mediaId, instagramUrl);
        if (instagramMediaDao.isExtractionSucceeded(mediaId)) {
            savePlacesFromMedia(memberId, sharedMediaId, mediaId);
        }
    }

    private void savePlacesFromMedia(Long memberId, Long sharedMediaId, Long mediaId) {
        List<Long> placeIds = mediaPlaceDao.findPlaceIds(mediaId);
        savedPlaceRegistrationService.savePlacesFromShare(memberId, sharedMediaId, placeIds);
    }

    private Long getOrCreateMediaId(MediaShortcode shortcode, InstagramUrl instagramUrl) {
        Optional<Long> existingMediaId = instagramMediaDao.findIdByShortcodeForUpdate(shortcode);
        if (existingMediaId.isPresent()) {
            Long mediaId = existingMediaId.get();
            retryExistingMediaIfEligible(mediaId, instagramUrl);
            return mediaId;
        }

        InstagramMedia instagramMedia = new InstagramMedia(shortcode);
        Long mediaId;
        try {
            mediaId = instagramMediaDao.save(instagramMedia, extractionProperties.pipelineVersion());
        } catch (DuplicateKeyException exception) {
            return instagramMediaDao.findIdByShortcodeForUpdate(shortcode)
                    .orElseThrow(() -> new IllegalStateException("게시물을 찾을 수 없습니다.", exception));
        }
        mediaExtractionDispatcher.dispatchAfterCommit(mediaId, instagramUrl);
        return mediaId;
    }

    private void retryExistingMediaIfEligible(Long mediaId, InstagramUrl instagramUrl) {
        ExtractionSnapshot snapshot = instagramMediaDao.findExtractionSnapshotForUpdate(mediaId);
        int pipelineVersion = extractionProperties.pipelineVersion();
        if (!snapshot.canRetry(pipelineVersion)) {
            return;
        }
        instagramMediaDao.updateExtractionForRetry(mediaId, pipelineVersion);
        mediaExtractionDispatcher.dispatchAfterCommit(mediaId, instagramUrl);
    }

    private Long createSharedMedia(Long memberId, Long mediaId, InstagramUrl instagramUrl) {
        SharedInstagramMedia sharedInstagramMedia = new SharedInstagramMedia(memberId, mediaId, instagramUrl);
        return sharedMediaDao.save(sharedInstagramMedia);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public ExtractionRetryResponse createExtractionRetry(Long memberId, Long sharedMediaId) {
        ExtractionRetrySource source = sharedMediaDao.findRetrySource(memberId, sharedMediaId)
                .orElseThrow(() -> new MediaException(MediaErrorCode.SHARED_MEDIA_NOT_FOUND));
        int pipelineVersion = extractionProperties.pipelineVersion();
        source.validateRetry(pipelineVersion);
        ExtractionSnapshot snapshot = instagramMediaDao.findExtractionSnapshotForUpdate(source.mediaId());
        ExtractionStatus status = snapshot.statusAfterRetry(pipelineVersion);
        if (snapshot.canRetry(pipelineVersion)) {
            instagramMediaDao.updateExtractionForRetry(source.mediaId(), pipelineVersion);
            mediaExtractionDispatcher.dispatchAfterCommit(source.mediaId(), source.instagramUrl());
        }
        Long newSharedMediaId = createRetryShare(memberId, source, status);
        return new ExtractionRetryResponse(newSharedMediaId, status.name());
    }

    private Long createRetryShare(Long memberId, ExtractionRetrySource source, ExtractionStatus status) {
        Optional<Long> existingShareId = sharedMediaDao.findExtractingShareId(memberId, source.mediaId());
        if (existingShareId.isPresent()) {
            return existingShareId.get();
        }
        Long newSharedMediaId = createSharedMedia(memberId, source.mediaId(), source.instagramUrl());
        if (status == ExtractionStatus.SUCCEEDED) {
            savePlacesFromMedia(memberId, newSharedMediaId, source.mediaId());
        }
        return newSharedMediaId;
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

    public ShareHistoryPlaceResponses readShareHistoryPlaces(Long memberId, Long sharedMediaId) {
        if (!sharedMediaDao.existsByMemberIdAndSharedMediaId(memberId, sharedMediaId)) {
            throw new MediaException(MediaErrorCode.SHARED_MEDIA_NOT_FOUND);
        }
        List<MediaPlaceProjection> places = mediaPlaceDao.findBySharedMediaId(sharedMediaId);
        Map<Long, String> placeThumbnailUrls = resolvePlaceThumbnailUrls(places);
        return ShareHistoryPlaceResponses.from(places, placeThumbnailUrls);
    }

    private Map<Long, String> resolvePlaceThumbnailUrls(List<MediaPlaceProjection> places) {
        Map<Long, String> placeThumbnailUrls = new LinkedHashMap<>();
        for (MediaPlaceProjection place : places) {
            String placeThumbnailUrl = mediaThumbnailUrlResolver.resolve(place.thumbnailKey());
            placeThumbnailUrls.put(place.placeId(), placeThumbnailUrl);
        }
        return placeThumbnailUrls;
    }
}
