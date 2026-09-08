package com.yeogidam.place.service;

import com.yeogidam.media.repository.InstagramMediaDao;
import com.yeogidam.media.repository.InstagramMediaRecord;
import com.yeogidam.media.repository.MediaPlaceDao;
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
    private final MediaPlaceDao mediaPlaceDao;
    private final InstagramMediaDao instagramMediaDao;

    public SavedPlaceService(
            PlaceDao placeDao,
            MediaPlaceDao mediaPlaceDao,
            InstagramMediaDao instagramMediaDao
    ) {
        this.placeDao = placeDao;
        this.mediaPlaceDao = mediaPlaceDao;
        this.instagramMediaDao = instagramMediaDao;
    }

    public SavedPlaceResponses readSavedPlaces(Long userId) {
        List<SavedPlaceResponse> savedPlaces = placeDao.findAllSavedByUserId(userId).stream()
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
            Long userId,
            Long placeId
    ) {
        validateSavedForUser(userId, placeId);
        List<PlaceMediaResponse> media = instagramMediaDao.findAllSavedByPlaceForUser(userId, placeId).stream()
                .map(this::toPlaceMediaResponse)
                .toList();
        return new PlaceMediaResponses(media);
    }

    private PlaceMediaResponse toPlaceMediaResponse(InstagramMediaRecord record) {
        return new PlaceMediaResponse(
                record.id(),
                record.title(),
                record.thumbnailUrl(),
                record.authorUsername(),
                record.sharedUrl(),
                record.createdAt().toLocalDate());
    }

    @Transactional
    public void deleteSavedPlace(
            Long userId,
            Long placeId
    ) {
        validateSavedForUser(userId, placeId);
        mediaPlaceDao.unsave(userId, placeId);
    }

    private void validateSavedForUser(
            Long userId,
            Long placeId
    ) {
        if (!mediaPlaceDao.existsSavedForUser(userId, placeId)) {
            throw new SavedPlaceNotFoundException();
        }
    }
}
