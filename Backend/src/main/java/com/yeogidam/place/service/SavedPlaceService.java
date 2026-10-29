package com.yeogidam.place.service;

import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.place.domain.PlaceCategory;
import com.yeogidam.place.domain.PlaceCategoryClassifier;
import com.yeogidam.place.dto.response.SavedPlaceMediaResponse;
import com.yeogidam.place.dto.response.SavedPlaceMediaResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponse;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import com.yeogidam.place.repository.SavedPlaceDao;
import com.yeogidam.place.repository.SavedPlaceFolderProjections;
import com.yeogidam.place.repository.SavedPlaceMediaProjections;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedPlaceService {

    private final SavedPlaceDao savedPlaceDao;
    private final MediaThumbnailUrlResolver mediaThumbnailUrlResolver;

    /**
     * 보관함을 최근 저장 순으로 읽고, 항목마다 폴더 ID를 담은 순서대로 붙인다.
     * 장소와 폴더 연결을 각각 한 번 조회하므로 보관함 항목 수와 무관하게 쿼리는 두 번 실행한다.
     */
    public SavedPlaceResponses readSavedPlaces(Long memberId) {
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMember(memberId);
        List<SavedPlaceResponse> responses = savedPlaceDao.findAllByMember(memberId)
                .stream()
                .map(projection -> {
                    PlaceCategory category = PlaceCategoryClassifier.classify(projection.category());
                    String placeThumbnailUrl = mediaThumbnailUrlResolver.resolve(projection.thumbnailKey());
                    List<Long> folderIds = folders.folderIdsOf(projection.savedPlaceId());
                    return SavedPlaceResponse.from(projection, placeThumbnailUrl, category, folderIds);
                })
                .toList();
        return SavedPlaceResponses.fromResponses(responses);
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
     * 고른 보관함 항목을 한 번에 지운다. 이미 지웠거나 남의 항목이 섞여 있어도 "그 항목이 내 보관함에 없다"는 결과가 같아 멱등하게 204다.
     */
    @Transactional
    public void deleteSavedPlaces(Long memberId, List<Long> savedPlaceIds) {
        if (savedPlaceIds.isEmpty()) {
            throw new PlaceException(PlaceErrorCode.EMPTY_SAVED_PLACE_IDS);
        }
        savedPlaceDao.deleteByMemberAndIds(memberId, savedPlaceIds);
    }
}
