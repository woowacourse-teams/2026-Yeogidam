package com.yeogidam.media.share.service;

import com.yeogidam.media.extraction.repository.MediaPlaceDao;
import com.yeogidam.media.extraction.repository.SavedMediaPlaceProjections;
import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.media.share.domain.CaptionSearchQuery;
import com.yeogidam.media.share.dto.response.SavedMediaResponses;
import com.yeogidam.media.share.repository.SavedMediaProjections;
import com.yeogidam.media.share.repository.SharedMediaCursor;
import com.yeogidam.media.share.repository.SharedMediaDao;
import java.time.Instant;
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

    public SavedMediaResponses readSharedMedia(
            Long memberId,
            String query,
            Instant cursorCreatedAt,
            Long cursorId
    ) {
        CaptionSearchQuery searchQuery = new CaptionSearchQuery(query);
        SavedMediaProjections shares = SharedMediaCursor.fromParameters(cursorCreatedAt, cursorId)
                .map(cursor -> sharedMediaDao.findSavedMediaByQueryBefore(memberId, searchQuery, cursor))
                .orElseGet(() -> sharedMediaDao.findSavedMediaByQuery(memberId, searchQuery));
        SavedMediaPlaceProjections places = mediaPlaceDao.findSavedMediaPlaces(memberId, shares.pageMediaIds());
        return SavedMediaResponses.from(shares, places, thumbnailUrlResolver::resolve);
    }
}
