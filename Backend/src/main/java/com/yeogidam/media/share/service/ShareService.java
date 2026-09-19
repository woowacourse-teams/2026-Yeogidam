package com.yeogidam.media.share.service;

import com.yeogidam.media.share.dto.response.ShareHistoryDetailResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import com.yeogidam.media.share.exception.ShareErrorCode;
import com.yeogidam.media.share.exception.ShareException;
import com.yeogidam.media.share.repository.PlaceCandidateDao;
import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.ShareDao;
import com.yeogidam.media.share.repository.ShareProjection;
import com.yeogidam.media.share.repository.ShareHistoryDetailProjection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ShareService {

    private final ShareDao shareDao;
    private final PlaceCandidateDao placeCandidateDao;

    public ShareHistoryResponses readShareHistory(Long memberId) {
        List<ShareProjection> history = shareDao.findShares(memberId);
        return new ShareHistoryResponses(history);
    }

    public ShareHistoryDetailResponse readShareHistoryDetail(Long memberId, Long sharedMediaId) {
        ShareHistoryDetailProjection sharedMedia = shareDao.findShareHistoryDetail(memberId, sharedMediaId)
                .orElseThrow(() -> new ShareException(ShareErrorCode.NOT_FOUND));
        List<PlaceCandidateProjection> candidates = placeCandidateDao.findCandidates(sharedMediaId);
        return new ShareHistoryDetailResponse(sharedMedia, candidates);
    }
}
