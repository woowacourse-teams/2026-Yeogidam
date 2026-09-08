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
import com.yeogidam.media.repository.MediaShareDao;
import com.yeogidam.media.repository.MediaShareView;
import com.yeogidam.media.repository.SharePlaceDao;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.dto.response.PlaceResponse;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.repository.PlaceDecisionView;
import com.yeogidam.member.service.MemberService;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 접수는 "게시물 찾기 → 공유 붙이기"의 두 걸음이다. 게시물은 shortcode로 유일해
 * 이미 있으면 공유만 쌓고, 추출 성공본이면 후보를 발급하며, 없을 때만 추출이 돈다.
 */
@Service
@Transactional(readOnly = true)
public class InstagramMediaService {

    private final InstagramMediaDao instagramMediaDao;
    private final MediaShareDao mediaShareDao;
    private final SharePlaceDao sharePlaceDao;
    private final PlaceDao placeDao;
    private final InstagramMediaReader instagramMediaReader;
    private final ExtractionPipeline extractionPipeline;
    private final MemberService memberService;

    public InstagramMediaService(
            InstagramMediaDao instagramMediaDao,
            MediaShareDao mediaShareDao,
            SharePlaceDao sharePlaceDao,
            PlaceDao placeDao,
            InstagramMediaReader instagramMediaReader,
            ExtractionPipeline extractionPipeline,
            MemberService memberService
    ) {
        this.instagramMediaDao = instagramMediaDao;
        this.mediaShareDao = mediaShareDao;
        this.sharePlaceDao = sharePlaceDao;
        this.placeDao = placeDao;
        this.instagramMediaReader = instagramMediaReader;
        this.extractionPipeline = extractionPipeline;
        this.memberService = memberService;
    }

    @Transactional
    public InstagramMediaReceiptResponse createInstagramMedia(
            Long memberId,
            InstagramMediaCreateRequest request
    ) {
        memberService.validateExists(memberId);
        MediaShare share = new MediaShare(new OwnerId(memberId), parseInstagramUrl(request.instagramUrl()));
        String shortcode = share.instagramUrl().getMediaShortcode().value();
        String sharedUrl = share.instagramUrl().getSharedUrl();
        return instagramMediaDao.findByShortcode(shortcode)
                .map(media -> attachShare(memberId, sharedUrl, media))
                .orElseGet(() -> receiveNewMedia(memberId, shortcode, sharedUrl));
    }

    private InstagramUrl parseInstagramUrl(String instagramUrl) {
        try {
            return new InstagramUrl(instagramUrl);
        } catch (IllegalArgumentException exception) {
            throw new UnsupportedInstagramLinkException(exception.getMessage());
        }
    }

    private InstagramMediaReceiptResponse receiveNewMedia(
            Long memberId,
            String shortcode,
            String sharedUrl
    ) {
        Long mediaId = insertOrFindExisting(shortcode);
        InstagramMediaRecord media = instagramMediaDao.findById(mediaId)
                .orElseThrow(() -> new IllegalStateException("방금 만든 게시물이 없습니다. mediaId=" + mediaId));
        return attachShare(memberId, sharedUrl, media);
    }

    /**
     * 동시 접수가 같은 게시물을 함께 넣으려는 경쟁에서, 늦은 쪽은
     * shortcode 유니크 위반을 삼키고 먼저 들어간 행에 공유를 붙인다.
     */
    private Long insertOrFindExisting(String shortcode) {
        try {
            Long mediaId = instagramMediaDao.insert(newExtractingRecord(shortcode));
            dispatchAfterCommit(mediaId, shortcode);
            return mediaId;
        } catch (DuplicateKeyException exception) {
            return instagramMediaDao.findByShortcode(shortcode)
                    .map(InstagramMediaRecord::id)
                    .orElseThrow(() -> exception);
        }
    }

    private InstagramMediaRecord newExtractingRecord(String shortcode) {
        return new InstagramMediaRecord(
                null,
                shortcode,
                null,
                null,
                null,
                null,
                ExtractionStatus.EXTRACTING.name(),
                null,
                ExtractionPipeline.PROCESSING_VERSION,
                null);
    }

    private InstagramMediaReceiptResponse attachShare(
            Long memberId,
            String sharedUrl,
            InstagramMediaRecord media
    ) {
        Long shareId = mediaShareDao.insert(memberId, media.id(), sharedUrl);
        if (isReusable(media)) {
            sharePlaceDao.issueCandidates(shareId, media.id());
            return new InstagramMediaReceiptResponse(shareId, ExtractionStatus.SUCCEEDED.name());
        }
        reprocessIfClaimed(media);
        return new InstagramMediaReceiptResponse(shareId, ExtractionStatus.EXTRACTING.name());
    }

    private boolean isReusable(InstagramMediaRecord media) {
        String succeeded = ExtractionStatus.SUCCEEDED.name();
        return succeeded.equals(media.extractionStatus())
                && media.processingVersion() == ExtractionPipeline.PROCESSING_VERSION;
    }

    /**
     * 실패했거나 버전이 지난 게시물만 조건부 UPDATE로 선점해 다시 돌린다.
     * 선점에 진 공유는 이미 도는 추출에 합류한다(파이프라인은 게시물당 한 번).
     */
    private void reprocessIfClaimed(InstagramMediaRecord media) {
        if (instagramMediaDao.claimReprocess(media.id(), ExtractionPipeline.PROCESSING_VERSION) > 0) {
            dispatchAfterCommit(media.id(), media.mediaShortcode());
        }
    }

    public InstagramMediaResponses readInstagramMedias(Long memberId) {
        List<InstagramMediaResponse> shares = mediaShareDao.findAllByMemberId(memberId).stream()
                .map(this::toInstagramMediaResponse)
                .toList();
        return new InstagramMediaResponses(shares);
    }

    private InstagramMediaResponse toInstagramMediaResponse(MediaShareView view) {
        return new InstagramMediaResponse(
                view.shareId(),
                view.title(),
                view.thumbnailUrl(),
                view.authorUsername(),
                view.extractionStatus(),
                view.sharedAt().toLocalDate());
    }

    public InstagramMediaDetailResponse readInstagramMedia(
            Long memberId,
            Long shareId
    ) {
        MediaShareView view = instagramMediaReader.readOwnedShareView(memberId, shareId);
        List<PlaceResponse> places = placeDao.findAllByShareId(shareId).stream()
                .map(this::toPlaceResponse)
                .toList();
        return toDetailResponse(view, places);
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
            MediaShareView view,
            List<PlaceResponse> places
    ) {
        return new InstagramMediaDetailResponse(
                view.shareId(),
                view.title(),
                view.thumbnailUrl(),
                view.authorUsername(),
                view.extractionStatus(),
                toFailureDescription(view.failureReason()),
                view.sharedUrl(),
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
            Long memberId,
            Long shareId
    ) {
        MediaShareView view = instagramMediaReader.readOwnedShareView(memberId, shareId);
        InstagramMedia instagramMedia = instagramMediaReader.read(view.mediaId());
        instagramMedia.retry();
        claimRetry(view.mediaId());
        dispatchAfterCommit(view.mediaId(), instagramMedia.shortcode().value());
    }

    private void claimRetry(Long mediaId) {
        if (instagramMediaDao.updateToExtractingIfFailed(mediaId) == 0) {
            throw new RetryNotAllowedException("이미 다시 시도가 접수된 게시물입니다.");
        }
    }

    private void dispatchAfterCommit(
            Long mediaId,
            String shortcode
    ) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                extractionPipeline.run(mediaId, shortcode);
            }
        });
    }
}
