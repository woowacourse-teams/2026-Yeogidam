package com.yeogidam.media.share.service;

import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.media.share.dto.response.SharedMediaWithPlaceCandidatesResponses;
import com.yeogidam.media.share.repository.PlaceCandidateDao;
import com.yeogidam.media.share.repository.PlaceCandidateProjection;
import com.yeogidam.media.share.repository.SharedMediaSummaryProjection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PlaceCandidateService {

    private final PlaceCandidateDao placeCandidateDao;
    private final MediaThumbnailUrlResolver mediaThumbnailUrlResolver;

    public SharedMediaWithPlaceCandidatesResponses readPlaceCandidates(Long memberId) {
        List<SharedMediaSummaryProjection> sharedMedias = placeCandidateDao.findSharedMedias(memberId);
        List<Long> sharedMediaIds = extractSharedMediaIds(sharedMedias);
        List<PlaceCandidateProjection> places = placeCandidateDao.findUndecidedCandidates(sharedMediaIds);
        Map<Long, String> instagramThumbnailUrls = resolveInstagramThumbnailUrls(sharedMedias);
        Map<Long, String> placeThumbnailUrls = resolvePlaceThumbnailUrls(places);
        return SharedMediaWithPlaceCandidatesResponses.from(
                sharedMedias, places, instagramThumbnailUrls, placeThumbnailUrls);
    }

    private List<Long> extractSharedMediaIds(List<SharedMediaSummaryProjection> sharedMedias) {
        return sharedMedias.stream()
                .map(SharedMediaSummaryProjection::sharedMediaId)
                .toList();
    }

    private Map<Long, String> resolveInstagramThumbnailUrls(
            List<SharedMediaSummaryProjection> sharedMedias
    ) {
        Map<Long, String> instagramThumbnailUrls = new HashMap<>();
        for (SharedMediaSummaryProjection sharedMedia : sharedMedias) {
            String instagramThumbnailUrl = mediaThumbnailUrlResolver.resolve(sharedMedia.thumbnailKey());
            instagramThumbnailUrls.put(sharedMedia.sharedMediaId(), instagramThumbnailUrl);
        }
        return instagramThumbnailUrls;
    }

    private Map<Long, String> resolvePlaceThumbnailUrls(List<PlaceCandidateProjection> places) {
        Map<Long, String> placeThumbnailUrls = new HashMap<>();
        for (PlaceCandidateProjection place : places) {
            String placeThumbnailUrl = mediaThumbnailUrlResolver.resolve(place.thumbnailKey());
            placeThumbnailUrls.put(place.placeId(), placeThumbnailUrl);
        }
        return placeThumbnailUrls;
    }
}
