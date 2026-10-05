package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.PlaceExtractionResult;
import com.yeogidam.media.extraction.repository.MediaPlaceDao;
import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import com.yeogidam.media.share.repository.SharedMediaDao;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.service.SavedPlaceRegistrationService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MediaExtractionResultWriter {

    private final InstagramMediaDao instagramMediaDao;
    private final PlaceDao placeDao;
    private final MediaPlaceDao mediaPlaceDao;
    private final SharedMediaDao sharedMediaDao;
    private final SavedPlaceRegistrationService savedPlaceRegistrationService;

    @Transactional
    public void recordSuccess(Long mediaId, PlaceExtractionResult result) {
        if (!instagramMediaDao.isExtractionInProgressForUpdate(mediaId)) {
            return;
        }
        List<Long> placeIds = getPlaceIds(mediaId, result);
        sharedMediaDao.findLatestSharesByMediaId(mediaId)
                .forEach(share -> savedPlaceRegistrationService.savePlacesFromShare(
                        share.memberId(), share.sharedMediaId(), placeIds));
        if (!instagramMediaDao.succeedExtractionIfInProgress(mediaId)) {
            throw new IllegalStateException("진행 중인 미디어의 추출 완료 상태를 저장하지 못했습니다.");
        }
        sharedMediaDao.updatePendingExtractions(mediaId);
    }

    private List<Long> getPlaceIds(Long mediaId, PlaceExtractionResult result) {
        return result.places().values()
                .stream()
                .map(place -> savePlaceForMedia(mediaId, place))
                .toList();
    }

    private Long savePlaceForMedia(Long mediaId, Place place) {
        Long placeId = placeDao.saveIfAbsent(place);
        mediaPlaceDao.saveIfAbsent(mediaId, placeId);
        return placeId;
    }
}
