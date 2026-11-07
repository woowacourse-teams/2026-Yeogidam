package com.yeogidam.place.service;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.repository.MediaPlaceDao;
import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.media.share.repository.SharedMediaDao;
import com.yeogidam.place.dto.request.SavedPlaceCreateRequest;
import com.yeogidam.place.dto.response.SavedPlaceMediaResponse;
import com.yeogidam.place.dto.response.SavedPlaceMediaResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import com.yeogidam.place.repository.SavedPlaceDao;
import com.yeogidam.place.repository.SavedPlaceFolderProjections;
import com.yeogidam.place.repository.SavedPlaceMediaProjections;
import com.yeogidam.place.repository.SavedPlaceProjections;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedPlaceService {

    private final SavedPlaceDao savedPlaceDao;
    private final SharedMediaDao sharedMediaDao;
    private final InstagramMediaDao instagramMediaDao;
    private final MediaPlaceDao mediaPlaceDao;
    private final MediaThumbnailUrlResolver mediaThumbnailUrlResolver;
    private final SavedPlaceRegistrationService savedPlaceRegistrationService;

    /**
     * 보관함을 최근 저장 순으로 읽고, 항목마다 폴더 ID를 담은 순서대로 붙인다.
     * 장소와 폴더 연결을 각각 한 번 조회하므로 보관함 항목 수와 무관하게 쿼리는 두 번 실행한다.
     */
    public SavedPlaceResponses readSavedPlaces(Long memberId) {
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMember(memberId);
        SavedPlaceProjections places = new SavedPlaceProjections(savedPlaceDao.findAllByMember(memberId));
        return SavedPlaceResponses.from(places, folders, mediaThumbnailUrlResolver::resolve);
    }

    /**
     * 그 장소를 저장하게 만든 릴스 목록. 같은 릴스를 여러 번 공유해 연결이 여럿이면 최신 공유 한 건만 낸다.
     */
    public SavedPlaceMediaResponses readSavedPlaceMedia(Long memberId, Long savedPlaceId) {
        if (!savedPlaceDao.existsByMemberAndId(memberId, savedPlaceId)) {
            throw new PlaceException(PlaceErrorCode.SAVED_PLACE_NOT_FOUND);
        }
        SavedPlaceMediaProjections shares = savedPlaceDao.findMediaBySavedPlace(savedPlaceId);
        List<SavedPlaceMediaResponse> responses = shares.latestPerMedia()
                .stream()
                .map(projection -> {
                    String instagramThumbnailUrl = mediaThumbnailUrlResolver.resolve(projection.thumbnailKey());
                    return SavedPlaceMediaResponse.from(projection, instagramThumbnailUrl);
                })
                .toList();
        return SavedPlaceMediaResponses.from(responses);
    }

    /**
     * 게시물 상세에서 체크를 켠 장소를 보관함에 저장하고, 요청한 공유 하나에만 연결한다. 지우지 않았고 분석에 성공한 내 공유만 받는다.
     * 이미 저장한 장소면 보관함을 바꾸지 않고 같은 보관함 항목 ID를 돌려준다.
     * 공유 접수, 추출 완료, 게시글 삭제와 같은 순서로 게시물(media)부터 잠근 뒤 공유가 지워지지 않았는지 다시 확인해서, 게시글 삭제와 겹쳐도 지운 공유에 장소가 붙지 않는다.
     * 트랜잭션을 READ COMMITTED로 열어서, 잠금을 기다린 뒤의 다시 확인이 그사이 커밋된 게시글 삭제까지 보게 한다.
     */
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SavedPlaceSaveResult createSavedPlace(Long memberId, SavedPlaceCreateRequest request) {
        Long mediaId = getSucceededShareMediaId(memberId, request.sharedMediaId());
        instagramMediaDao.lockByIds(List.of(mediaId));
        // 잠금을 기다리는 사이 게시글 삭제가 커밋됐으면 다시 확인에서 404를 낸다.
        getSucceededShareMediaId(memberId, request.sharedMediaId());
        if (!mediaPlaceDao.findPlaceIds(mediaId).contains(request.placeId())) {
            throw new PlaceException(PlaceErrorCode.NOT_EXTRACTED_PLACE);
        }
        return savedPlaceRegistrationService.savePlaceIfAbsent(memberId, request.sharedMediaId(), request.placeId());
    }

    private Long getSucceededShareMediaId(Long memberId, Long sharedMediaId) {
        return sharedMediaDao.findSucceededMediaIdByMemberAndId(memberId, sharedMediaId)
                .orElseThrow(() -> new MediaException(MediaErrorCode.SHARED_MEDIA_NOT_FOUND));
    }

    /**
     * 고른 보관함 항목을 한 번에 지운다. 이미 지웠거나 남의 항목이 섞여 있어도 "그 항목이 내 보관함에 없다"는 결과가 같아 멱등하게 204다.
     * 지울 항목의 장소 ID를 먼저 읽고 (member_id, place_id) 유니크 인덱스로 장소 ID 순서대로 잠근 뒤 지운다.
     * 공유와 추출 완료의 저장, 게시글 삭제도 같은 인덱스를 같은 순서로 잠그므로, 기본 키 순서로 지울 때 생기던 교착이 없다(MySQL 8.4에서 재현).
     */
    @Transactional
    public void deleteSavedPlaces(Long memberId, List<Long> savedPlaceIds) {
        if (savedPlaceIds.isEmpty()) {
            throw new PlaceException(PlaceErrorCode.EMPTY_SAVED_PLACE_IDS);
        }
        List<Long> placeIds = savedPlaceDao.findPlaceIdsByMemberAndIds(memberId, savedPlaceIds);
        if (placeIds.isEmpty()) {
            return;
        }
        savedPlaceDao.lockByMemberAndPlaceIds(memberId, placeIds);
        savedPlaceDao.deleteByMemberAndIds(memberId, savedPlaceIds);
    }
}
