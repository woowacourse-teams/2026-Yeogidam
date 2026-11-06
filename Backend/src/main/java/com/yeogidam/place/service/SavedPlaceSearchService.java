package com.yeogidam.place.service;

import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.place.dto.request.SavedPlaceSearchRequest;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.repository.SavedPlaceCategoryProjections;
import com.yeogidam.place.repository.SavedPlaceDao;
import com.yeogidam.place.repository.SavedPlaceFolderProjections;
import com.yeogidam.place.repository.SavedPlaceProjections;
import com.yeogidam.search.domain.SearchQuery;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedPlaceSearchService {

    private final SavedPlaceDao savedPlaceDao;
    private final MediaThumbnailUrlResolver thumbnailUrlResolver;

    public SavedPlaceResponses readSavedPlaces(Long memberId, SavedPlaceSearchRequest request) {
        SearchQuery query = request.toQuery();
        SavedPlaceCategoryProjections categories = savedPlaceDao.findCategoriesByMember(memberId);
        SavedPlaceProjections places = savedPlaceDao.findAllByMemberAndQuery(memberId, query, categories);
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMemberAndSavedPlaceIds(
                memberId, places.savedPlaceIds());
        return SavedPlaceResponses.from(places, folders, thumbnailUrlResolver::resolve);
    }
}
