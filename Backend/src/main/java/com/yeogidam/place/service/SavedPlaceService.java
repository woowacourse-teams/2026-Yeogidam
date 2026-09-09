package com.yeogidam.place.service;

import com.yeogidam.media.repository.MediaShareDao;
import com.yeogidam.media.repository.MediaShareView;
import com.yeogidam.place.domain.Address;
import com.yeogidam.place.dto.response.PlaceMediaResponse;
import com.yeogidam.place.dto.response.PlaceMediaResponses;
import com.yeogidam.place.dto.response.SavedPlaceResponse;
import com.yeogidam.place.dto.response.SavedPlaceResponses;
import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import com.yeogidam.place.repository.SavedPlaceDao;
import com.yeogidam.place.repository.SavedPlaceView;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class SavedPlaceService {

    private final SavedPlaceDao savedPlaceDao;
    private final MediaShareDao mediaShareDao;

    public SavedPlaceService(
            SavedPlaceDao savedPlaceDao,
            MediaShareDao mediaShareDao
    ) {
        this.savedPlaceDao = savedPlaceDao;
        this.mediaShareDao = mediaShareDao;
    }

    public SavedPlaceResponses readSavedPlaces(Long memberId) {
        List<SavedPlaceResponse> savedPlaces = savedPlaceDao.findAllViewsByMemberId(memberId).stream()
                .map(this::toSavedPlaceResponse)
                .toList();
        return new SavedPlaceResponses(savedPlaces);
    }

    private SavedPlaceResponse toSavedPlaceResponse(SavedPlaceView record) {
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

    /**
     * 보관함 행과 연결만 지운다. 지나간 공유의 후보를 되살리지 않는다(ADR-02 결정 6).
     */
    @Transactional
    public void deleteSavedPlace(
            Long memberId,
            Long placeId
    ) {
        validateSavedForMember(memberId, placeId);
        savedPlaceDao.deleteByMemberAndPlace(memberId, placeId);
    }

    private void validateSavedForMember(
            Long memberId,
            Long placeId
    ) {
        if (!savedPlaceDao.existsByMemberAndPlace(memberId, placeId)) {
            throw new PlaceException(PlaceErrorCode.SAVED_PLACE_NOT_FOUND);
        }
    }
}
