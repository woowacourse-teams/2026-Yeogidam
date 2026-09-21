package com.yeogidam.media.share.service;

import com.yeogidam.media.share.dto.response.SharedMediaWithPlaceCandidatesResponses;
import com.yeogidam.media.share.repository.PlaceCandidateDao;
import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.SharedMediaProjection;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlaceCandidateService {

    private final PlaceCandidateDao placeCandidateDao;

    public SharedMediaWithPlaceCandidatesResponses readPlaceCandidates(Long memberId) {
        List<SharedMediaProjection> sharedMedias = placeCandidateDao.findSharedMedias(memberId);
        List<Long> sharedMediaIds = extractSharedMediaIds(sharedMedias);
        List<PlaceCandidateProjection> places = placeCandidateDao.findUndecidedCandidates(sharedMediaIds);
        return SharedMediaWithPlaceCandidatesResponses.from(sharedMedias, places);
    }

    private List<Long> extractSharedMediaIds(List<SharedMediaProjection> sharedMedias) {
        return sharedMedias.stream()
                .map(SharedMediaProjection::sharedMediaId)
                .toList();
    }
}
