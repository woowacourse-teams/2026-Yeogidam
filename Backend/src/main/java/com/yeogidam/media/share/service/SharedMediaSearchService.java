package com.yeogidam.media.share.service;

import com.yeogidam.media.extraction.repository.MediaPlaceDao;
import com.yeogidam.media.extraction.repository.SavedMediaPlaceProjections;
import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.media.share.domain.CaptionSearchQuery;
import com.yeogidam.media.share.dto.request.SharedMediaSearchRequest;
import com.yeogidam.media.share.dto.response.SavedMediaResponses;
import com.yeogidam.media.share.repository.SavedMediaProjections;
import com.yeogidam.media.share.repository.SharedMediaDao;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SharedMediaSearchService {

    private final SharedMediaDao sharedMediaDao;
    private final MediaPlaceDao mediaPlaceDao;
    private final MediaThumbnailUrlResolver thumbnailUrlResolver;

    public SavedMediaResponses readSharedMedia(Long memberId, SharedMediaSearchRequest request) {
        CaptionSearchQuery query = request.toQuery();
        SavedMediaProjections shares = request.toCursor()
                .map(cursor -> sharedMediaDao.findSavedMediaByQueryBefore(memberId, query, cursor))
                .orElseGet(() -> sharedMediaDao.findSavedMediaByQuery(memberId, query));
        SavedMediaPlaceProjections places = mediaPlaceDao.findSavedMediaPlaces(memberId, shares.pageMediaIds());
        return SavedMediaResponses.from(shares, places, thumbnailUrlResolver::resolve);
    }
}
