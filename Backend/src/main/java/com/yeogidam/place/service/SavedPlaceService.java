package com.yeogidam.place.service;

import com.yeogidam.place.domain.Address;
import com.yeogidam.place.dto.response.PlaceReelResponse;
import com.yeogidam.place.dto.response.PlaceReelResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponse;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.SavedPlaceNotFoundException;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.repository.PlaceRecord;
import com.yeogidam.place.repository.SavedPlaceRecord;
import com.yeogidam.reel.repository.ReelDao;
import com.yeogidam.reel.repository.ReelRecord;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SavedPlaceService {

    private final PlaceDao placeDao;
    private final ReelDao reelDao;

    public SavedPlaceService(
            PlaceDao placeDao,
            ReelDao reelDao
    ) {
        this.placeDao = placeDao;
        this.reelDao = reelDao;
    }

    public SavedPlaceResponses readSavedPlaces() {
        List<SavedPlaceResponse> savedPlaces = placeDao.findAllSaved().stream()
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
                record.reelCount());
    }

    public PlaceReelResponses readSavedPlaceReels(Long placeId) {
        getSavedPlace(placeId);
        List<PlaceReelResponse> reels = reelDao.findAllBySamePlace(placeId).stream()
                .map(this::toPlaceReelResponse)
                .toList();
        return new PlaceReelResponses(reels);
    }

    private PlaceRecord getSavedPlace(Long placeId) {
        return placeDao.findById(placeId)
                .filter(PlaceRecord::saved)
                .orElseThrow(SavedPlaceNotFoundException::new);
    }

    private PlaceReelResponse toPlaceReelResponse(ReelRecord record) {
        return new PlaceReelResponse(
                record.id(),
                record.title(),
                record.thumbnailUrl(),
                record.authorUsername(),
                record.sharedUrl(),
                record.createdAt().toLocalDate());
    }

    @Transactional
    public void deleteSavedPlace(Long placeId) {
        getSavedPlace(placeId);
        placeDao.unsaveSamePlace(placeId);
    }
}
