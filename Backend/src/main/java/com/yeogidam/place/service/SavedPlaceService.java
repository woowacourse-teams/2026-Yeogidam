package com.yeogidam.place.service;

import com.yeogidam.media.repository.MediaShareDao;
import com.yeogidam.media.repository.MediaShareView;
import com.yeogidam.media.repository.SharePlaceDao;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.dto.response.PlaceMediaResponse;
import com.yeogidam.place.dto.response.PlaceMediaResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponse;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.SavedPlaceNotFoundException;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.repository.SavedPlaceRecord;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SavedPlaceService {

    private final PlaceDao placeDao;
    private final SharePlaceDao sharePlaceDao;
    private final MediaShareDao mediaShareDao;

    public SavedPlaceService(
            PlaceDao placeDao,
            SharePlaceDao sharePlaceDao,
            MediaShareDao mediaShareDao
    ) {
        this.placeDao = placeDao;
        this.sharePlaceDao = sharePlaceDao;
        this.mediaShareDao = mediaShareDao;
    }

    public SavedPlaceResponses readSavedPlaces(Long memberId) {
        List<SavedPlaceResponse> savedPlaces = placeDao.findAllSavedByMemberId(memberId).stream()
                .map(this::toSavedPlaceResponse)
                .toList();
        return new SavedPlaceResponses(savedPlaces);
    }

    private SavedPlaceResponse toSavedPlaceResponse(SavedPlaceRecord record) {
        return new SavedPlaceResponse(
                record.id(),
                record.name(),
                record.category(),
                new Address(record.address(), record.roadAddress()).summary(),
                record.roadAddress(),
                record.latitude(),
                record.longitude(),
                record.kakaoPlaceUrl(),
                record.telephone(),
                record.thumbnailUrl(),
                record.mediaCount());
    }

    public PlaceMediaResponses readSavedPlaceMedia(
            Long memberId,
            Long placeId
    ) {
        validateSavedForMember(memberId, placeId);
        List<PlaceMediaResponse> media = mediaShareDao.findAllSavedByPlaceForMember(memberId, placeId).stream()
                .map(this::toPlaceMediaResponse)
                .toList();
        return new PlaceMediaResponses(media);
    }

    private PlaceMediaResponse toPlaceMediaResponse(MediaShareView view) {
        return new PlaceMediaResponse(
                view.shareId(),
                view.title(),
                view.thumbnailUrl(),
                view.authorUsername(),
                view.sharedUrl(),
                view.sharedAt().toLocalDate());
    }

    @Transactional
    public void deleteSavedPlace(
            Long memberId,
            Long placeId
    ) {
        validateSavedForMember(memberId, placeId);
        sharePlaceDao.unsave(memberId, placeId);
    }

    private void validateSavedForMember(
            Long memberId,
            Long placeId
    ) {
        if (!sharePlaceDao.existsSavedForMember(memberId, placeId)) {
            throw new SavedPlaceNotFoundException();
        }
    }
}
