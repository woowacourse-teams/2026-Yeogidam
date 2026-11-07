package com.yeogidam.place.service;

import com.yeogidam.media.instagram.infrastructure.MediaThumbnailUrlResolver;
import com.yeogidam.place.domain.PlaceCategory;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import com.yeogidam.place.repository.SavedPlaceCategoryProjections;
import com.yeogidam.place.repository.SavedPlaceDao;
import com.yeogidam.place.repository.SavedPlaceFolderProjections;
import com.yeogidam.place.repository.SavedPlaceProjections;
import com.yeogidam.search.domain.SearchQuery;
import com.yeogidam.search.exception.SearchException;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SavedPlaceSearchService {

    private final SavedPlaceDao savedPlaceDao;
    private final MediaThumbnailUrlResolver thumbnailUrlResolver;

    public SavedPlaceResponses readSavedPlaces(Long memberId, String queryText) {
        SearchQuery query = createSearchQuery(queryText);
        SavedPlaceCategoryProjections categories = readSearchCategories(memberId, query);
        SavedPlaceProjections places = savedPlaceDao.findAllByMemberAndQuery(memberId, query, categories);
        SavedPlaceFolderProjections folders = savedPlaceDao.findFolderLinksByMemberAndSavedPlaceIds(
                memberId, places.savedPlaceIds());
        return SavedPlaceResponses.from(places, folders, thumbnailUrlResolver::resolve);
    }

    private SearchQuery createSearchQuery(String queryText) {
        try {
            return new SearchQuery(queryText);
        } catch (SearchException exception) {
            throw new PlaceException(PlaceErrorCode.INVALID_SEARCH_QUERY);
        }
    }

    private SavedPlaceCategoryProjections readSearchCategories(Long memberId, SearchQuery query) {
        if (!PlaceCategory.hasAnyNameContaining(query.getWords())) {
            return new SavedPlaceCategoryProjections(List.of());
        }
        return savedPlaceDao.findCategoriesByMember(memberId);
    }
}
