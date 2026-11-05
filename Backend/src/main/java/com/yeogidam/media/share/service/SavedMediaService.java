package com.yeogidam.media.share.service;

import com.yeogidam.media.extraction.repository.MediaPlaceDao;
import com.yeogidam.media.extraction.repository.SavedMediaPlaceProjections;
import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
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
public class SavedMediaService {

    private final SharedMediaDao sharedMediaDao;
    private final MediaPlaceDao mediaPlaceDao;
    private final MediaThumbnailUrlResolver mediaThumbnailUrlResolver;

    /**
     * 보관함 게시물 탭의 한 페이지를 읽어, 보관함 연결이 남은 내 공유를 게시물마다 최신 한 건으로 줄여 50건씩 내리고
     * 게시물마다 추출된 장소를 붙인다. 공유 조회와 장소 조회를 한 트랜잭션에서 한 번씩 실행해 같은 시점을 읽는다.
     */
    public SavedMediaResponses readSavedMedia(
            Long memberId,
            Instant cursorCreatedAt,
            Long cursorId
    ) {
        SavedMediaProjections shares = SharedMediaCursor.fromParameters(cursorCreatedAt, cursorId)
                .map(cursor -> sharedMediaDao.findSavedMediaBefore(memberId, cursor))
                .orElseGet(() -> sharedMediaDao.findSavedMedia(memberId));
        SavedMediaPlaceProjections places = mediaPlaceDao.findSavedMediaPlaces(memberId, shares.pageMediaIds());
        return SavedMediaResponses.from(shares, places, mediaThumbnailUrlResolver::resolve);
    }
}
