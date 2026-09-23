package com.yeogidam.media.share.service;

import com.yeogidam.media.share.dto.response.ShareHistoryItemResponse;
import com.yeogidam.media.share.dto.response.ShareHistoryResponses;
import com.yeogidam.media.share.dto.response.PlaceCandidateResponses;
import com.yeogidam.media.share.exception.ShareErrorCode;
import com.yeogidam.media.share.exception.ShareException;
import com.yeogidam.media.share.repository.PlaceCandidateDao;
import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.SharedMediaDao;
import com.yeogidam.media.share.repository.ShareHistoryProjection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ShareService {

    private final SharedMediaDao sharedMediaDao;
    private final PlaceCandidateDao placeCandidateDao;

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
