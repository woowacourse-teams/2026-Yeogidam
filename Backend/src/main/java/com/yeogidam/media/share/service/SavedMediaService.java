package com.yeogidam.media.share.service;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.repository.MediaPlaceDao;
import com.yeogidam.media.extraction.repository.SavedMediaPlaceProjections;
import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.media.share.dto.response.SavedMediaResponses;
import com.yeogidam.media.share.repository.SavedMediaProjections;
import com.yeogidam.media.share.repository.SharedMediaCursor;
import com.yeogidam.media.share.repository.SharedMediaDao;
import com.yeogidam.place.repository.SavedPlaceDao;
import com.yeogidam.search.repository.SearchQuery;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedMediaService {

    private final Clock clock;
    private final SharedMediaDao sharedMediaDao;
    private final MediaPlaceDao mediaPlaceDao;
    private final InstagramMediaDao instagramMediaDao;
    private final SavedPlaceDao savedPlaceDao;
    private final MediaThumbnailUrlResolver mediaThumbnailUrlResolver;

    /**
     * 보관함 게시물 탭의 한 페이지를 읽어, 지우지 않았고 분석에 성공했으며 추출된 장소가 있는 내 공유를 게시물마다 최신 한 건으로 줄여 50건씩 내리고
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
        return toSavedMediaResponses(memberId, shares);
    }

    public SavedMediaResponses searchSavedMedia(
            Long memberId,
            String query,
            Instant cursorCreatedAt,
            Long cursorId
    ) {
        SearchQuery searchQuery = new SearchQuery(query);
        SavedMediaProjections shares = SharedMediaCursor.fromParameters(cursorCreatedAt, cursorId)
                .map(cursor -> sharedMediaDao.findSavedMediaByQueryBefore(memberId, searchQuery, cursor))
                .orElseGet(() -> sharedMediaDao.findSavedMediaByQuery(memberId, searchQuery));
        return toSavedMediaResponses(memberId, shares);
    }

    /**
     * 고른 게시글을 보관함에서 지운다. 게시글마다 같은 게시물의 내 공유를 모두 지운 것으로 표시하고, 남은 게시글이 쓰지 않는 장소를 보관함에서 뺀다.
     * 히스토리는 지운 공유도 그대로 보여 준다. 이미 지웠거나 남의 공유가 섞여 있어도 "해당 게시글이 내 보관함에 없다"는 결과가 같아 멱등하게 204다.
     * 공유 접수, 추출 완료와 같은 순서로 게시물(media)부터 잠가서, 지우는 사이에 추출이 끝나도 지운 공유에 장소가 붙지 않는다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public void deleteSavedMedia(Long memberId, List<Long> sharedMediaIds) {
        if (sharedMediaIds.isEmpty()) {
            throw new MediaException(MediaErrorCode.EMPTY_SHARED_MEDIA_IDS);
        }
        List<Long> mediaIds = sharedMediaDao.findMediaIdsByMemberAndIds(memberId, sharedMediaIds);
        if (mediaIds.isEmpty()) {
            return;
        }
        instagramMediaDao.lockByIds(mediaIds);
        sharedMediaDao.softDeleteByMemberAndMediaIds(memberId, mediaIds, clock.instant());
        deleteSavedPlacesOnlyFrom(memberId, mediaIds);
    }

    /**
     * 지운 게시물의 장소 가운데 보관함에 있는 항목을 장소 ID 순서로 잠근 뒤, 남은 게시글이 쓰지 않는 항목만 지운다.
     * 남은 게시글이 쓰는 항목은 지우지 않은 공유와 연결이 있거나, 지우지 않은 내 성공 공유의 게시물에서 같은 장소가 추출된 항목이다.
     * 트랜잭션을 READ COMMITTED로 열어서, 잠금을 기다린 뒤의 확인이 그사이 커밋된 연결과 공유 삭제까지 본다.
     * 연결 확인을 DELETE 안의 서브쿼리로 하면 회원의 다른 공유 레코드에 공유 락이 걸려, 같은 회원의 다른 게시물 추출 완료나 다른 게시글 삭제와 교착한다(MySQL 8.4에서 재현).
     */
    private void deleteSavedPlacesOnlyFrom(Long memberId, List<Long> mediaIds) {
        List<Long> placeIds = savedPlaceDao.findPlaceIdsByMemberAndMediaIds(memberId, mediaIds);
        if (placeIds.isEmpty()) {
            return;
        }
        savedPlaceDao.lockByMemberAndPlaceIds(memberId, placeIds);
        List<Long> unusedIds = savedPlaceDao.findUnusedIdsByMemberAndPlaceIds(memberId, placeIds);
        if (unusedIds.isEmpty()) {
            return;
        }
        savedPlaceDao.deleteByMemberAndIds(memberId, unusedIds);
    }

    private SavedMediaResponses toSavedMediaResponses(Long memberId, SavedMediaProjections shares) {
        SavedMediaPlaceProjections places = mediaPlaceDao.findSavedMediaPlaces(memberId, shares.pageMediaIds());
        return SavedMediaResponses.from(shares, places, mediaThumbnailUrlResolver::resolve);
    }
}
