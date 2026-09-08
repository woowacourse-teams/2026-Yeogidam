package com.yeogidam.media.service;

import com.yeogidam.media.domain.ExtractionFailureReason;
import com.yeogidam.media.domain.ExtractionStatus;
import com.yeogidam.media.domain.InstagramMedia;
import com.yeogidam.media.domain.InstagramUrl;
import com.yeogidam.media.domain.MediaShare;
import com.yeogidam.media.domain.OwnerId;
import com.yeogidam.media.dto.request.InstagramMediaCreateRequest;
import com.yeogidam.media.dto.response.InstagramMediaDetailResponse;
import com.yeogidam.media.dto.response.InstagramMediaReceiptResponse;
import com.yeogidam.media.dto.response.InstagramMediaResponse;
import com.yeogidam.media.dto.response.InstagramMediaResponses;
import com.yeogidam.media.exception.RetryNotAllowedException;
import com.yeogidam.media.exception.UnsupportedInstagramLinkException;
import com.yeogidam.media.repository.InstagramMediaDao;
import com.yeogidam.media.repository.InstagramMediaRecord;
import com.yeogidam.media.repository.MediaPlaceDao;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.dto.response.PlaceResponse;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.repository.PlaceDecisionView;
import com.yeogidam.user.service.UserService;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
@Transactional(readOnly = true)
public class InstagramMediaService {

    private final InstagramMediaDao instagramMediaDao;
    private final MediaPlaceDao mediaPlaceDao;
    private final PlaceDao placeDao;
    private final InstagramMediaReader instagramMediaReader;
    private final ExtractionPipeline extractionPipeline;
    private final UserService userService;

    public InstagramMediaService(
            InstagramMediaDao instagramMediaDao,
            MediaPlaceDao mediaPlaceDao,
            PlaceDao placeDao,
            InstagramMediaReader instagramMediaReader,
            ExtractionPipeline extractionPipeline,
            UserService userService
    ) {
        this.instagramMediaDao = instagramMediaDao;
        this.mediaPlaceDao = mediaPlaceDao;
        this.placeDao = placeDao;
        this.instagramMediaReader = instagramMediaReader;
        this.extractionPipeline = extractionPipeline;
        this.userService = userService;
    }

    @Transactional
    public InstagramMediaReceiptResponse createInstagramMedia(
            Long userId,
            InstagramMediaCreateRequest request
    ) {
        userService.validateExists(userId);
        MediaShare mediaShare = new MediaShare(new OwnerId(userId), parseInstagramUrl(request.instagramUrl()));
        InstagramMedia instagramMedia = new InstagramMedia(mediaShare.instagramUrl().getMediaShortcode());
        String shortcode = instagramMedia.shortcode().value();
        return instagramMediaDao.findCompletedByShortcode(shortcode, ExtractionPipeline.PROCESSING_VERSION)
                .map(completed -> reuseCompleted(userId, mediaShare.instagramUrl().getSharedUrl(), completed))
                .orElseGet(() -> receiveNew(userId, mediaShare.instagramUrl().getSharedUrl(), instagramMedia));
    }

    private InstagramUrl parseInstagramUrl(String instagramUrl) {
        try {
            return new InstagramUrl(instagramUrl);
        } catch (IllegalArgumentException exception) {
            throw new UnsupportedInstagramLinkException(exception.getMessage());
        }
    }

    private InstagramMediaReceiptResponse reuseCompleted(
            Long userId,
            String sharedUrl,
            InstagramMediaRecord completed
    ) {
        Long mediaId = instagramMediaDao.insert(new InstagramMediaRecord(
                null,
                userId,
                sharedUrl,
                completed.mediaShortcode(),
                completed.title(),
                completed.caption(),
                completed.thumbnailUrl(),
                completed.authorUsername(),
                ExtractionStatus.SUCCEEDED.name(),
                null,
                completed.processingVersion(),
                null));
        mediaPlaceDao.copyLinks(completed.id(), mediaId);
        return new InstagramMediaReceiptResponse(mediaId, ExtractionStatus.SUCCEEDED.name());
    }

    private InstagramMediaReceiptResponse receiveNew(
            Long userId,
            String sharedUrl,
            InstagramMedia instagramMedia
    ) {
        Long mediaId = instagramMediaDao.insert(new InstagramMediaRecord(
                null,
                userId,
                sharedUrl,
                instagramMedia.shortcode().value(),
                null,
                null,
                null,
                null,
                instagramMedia.extraction().status().name(),
                null,
                ExtractionPipeline.PROCESSING_VERSION,
                null));
        dispatchAfterCommit(mediaId, sharedUrl);
        return new InstagramMediaReceiptResponse(mediaId, instagramMedia.extraction().status().name());
    }

    public InstagramMediaResponses readInstagramMedias(Long userId) {
        List<InstagramMediaResponse> medias = instagramMediaDao.findAllByUserId(userId).stream()
                .map(this::toInstagramMediaResponse)
                .toList();
        return new InstagramMediaResponses(medias);
    }

    private InstagramMediaResponse toInstagramMediaResponse(InstagramMediaRecord record) {
        return new InstagramMediaResponse(
                record.id(),
                record.title(),
                record.thumbnailUrl(),
                record.authorUsername(),
                record.extractionStatus(),
                record.createdAt().toLocalDate());
    }

    public InstagramMediaDetailResponse readInstagramMedia(
            Long userId,
            Long mediaId
    ) {
        InstagramMediaRecord record = instagramMediaReader.readOwnedRecord(userId, mediaId);
        List<PlaceResponse> places = placeDao.findAllByMediaId(mediaId).stream()
                .map(this::toPlaceResponse)
                .toList();
        return toDetailResponse(record, places);
    }

    private PlaceResponse toPlaceResponse(PlaceDecisionView view) {
        return new PlaceResponse(
                view.placeId(),
                view.name(),
                view.category(),
                new Address(view.address(), view.roadAddress()).summary(),
                view.roadAddress(),
                view.kakaoPlaceUrl(),
                view.telephone(),
                view.thumbnailUrl(),
                view.decisionStatus());
    }

    private InstagramMediaDetailResponse toDetailResponse(
            InstagramMediaRecord record,
            List<PlaceResponse> places
    ) {
        return new InstagramMediaDetailResponse(
                record.id(),
                record.title(),
                record.thumbnailUrl(),
                record.authorUsername(),
                record.extractionStatus(),
                toFailureDescription(record.failureReason()),
                record.sharedUrl(),
                places.size(),
                places);
    }

    private String toFailureDescription(String failureReason) {
        if (failureReason == null) {
            return null;
        }
        return ExtractionFailureReason.valueOf(failureReason).description();
    }

    @Transactional
    public void createExtractionRetry(
            Long userId,
            Long mediaId
    ) {
        InstagramMedia instagramMedia = instagramMediaReader.readOwned(userId, mediaId);
        instagramMedia.retry();
        claimRetry(mediaId);
        dispatchAfterCommit(mediaId, instagramMediaReader.readRecord(mediaId).sharedUrl());
    }

    private void claimRetry(Long mediaId) {
        if (instagramMediaDao.updateToExtractingIfFailed(mediaId) == 0) {
            throw new RetryNotAllowedException("이미 다시 시도가 접수된 미디어입니다.");
        }
    }

    private void dispatchAfterCommit(
            Long mediaId,
            String sharedUrl
    ) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                extractionPipeline.run(mediaId, sharedUrl);
            }
        });
    }
}
