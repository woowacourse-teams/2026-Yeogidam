package com.yeogidam.media.service;

import com.yeogidam.media.repository.InstagramMediaDao;
import com.yeogidam.media.repository.MediaPlaceDao;
import com.yeogidam.media.domain.ExtractionFailureReason;
import com.yeogidam.media.domain.ExtractionStatus;
import com.yeogidam.place.repository.PlaceDao;
import com.yeogidam.place.repository.PlaceRecord;
import com.yeogidam.place.service.SearchedPlace;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 추출 결과 기록을 트랜잭션 단위로 묶는다.
 * 장소는 전역 사실이라 카카오 place id로 찾고 없을 때만 만들며,
 * 미디어와의 연결(media_place)이 UNDECIDED로 태어난다.
 */
@Service
@Transactional(readOnly = true)
public class ExtractionResultRecorder {

    private final InstagramMediaDao instagramMediaDao;
    private final PlaceDao placeDao;
    private final MediaPlaceDao mediaPlaceDao;

    public ExtractionResultRecorder(
            InstagramMediaDao instagramMediaDao,
            PlaceDao placeDao,
            MediaPlaceDao mediaPlaceDao
    ) {
        this.instagramMediaDao = instagramMediaDao;
        this.placeDao = placeDao;
        this.mediaPlaceDao = mediaPlaceDao;
    }

    @Transactional
    public void recordSuccess(
            Long mediaId,
            ExtractionOutcome outcome
    ) {
        InstagramContent content = outcome.content();
        instagramMediaDao.updateContent(mediaId, content.title(), content.caption(), content.thumbnailUrl(), content.authorUsername());
        mediaPlaceDao.deleteAllByMediaId(mediaId);
        linkPlaces(mediaId, outcome.places());
        instagramMediaDao.updateExtractionResult(mediaId, ExtractionStatus.SUCCEEDED.name(), null);
    }

    private void linkPlaces(
            Long mediaId,
            List<SearchedPlace> searchedPlaces
    ) {
        for (int position = 0; position < searchedPlaces.size(); position++) {
            Long placeId = getOrCreatePlaceId(searchedPlaces.get(position));
            mediaPlaceDao.insert(mediaId, placeId, position);
        }
    }

    private Long getOrCreatePlaceId(SearchedPlace searchedPlace) {
        return placeDao.findByKakaoPlaceId(searchedPlace.kakaoPlaceId())
                .map(PlaceRecord::id)
                .orElseGet(() -> insertOrFindExisting(searchedPlace));
    }

    /**
     * 동시 추출이 같은 신규 장소를 함께 넣으려는 경쟁에서, 늦은 쪽은
     * 유니크 위반을 삼키고 먼저 들어간 행을 다시 찾아 쓴다.
     */
    private Long insertOrFindExisting(SearchedPlace searchedPlace) {
        try {
            return placeDao.insert(toPlaceRecord(searchedPlace));
        } catch (DuplicateKeyException exception) {
            return placeDao.findByKakaoPlaceId(searchedPlace.kakaoPlaceId())
                    .map(PlaceRecord::id)
                    .orElseThrow(() -> exception);
        }
    }

    private PlaceRecord toPlaceRecord(SearchedPlace searchedPlace) {
        return new PlaceRecord(
                null,
                searchedPlace.kakaoPlaceId(),
                searchedPlace.name(),
                searchedPlace.category(),
                searchedPlace.landLotAddress(),
                searchedPlace.roadAddress(),
                searchedPlace.latitude(),
                searchedPlace.longitude(),
                searchedPlace.kakaoPlaceUrl(),
                searchedPlace.telephone(),
                searchedPlace.thumbnailUrl(),
                "FAKE",
                null);
    }

    @Transactional
    public void recordFailure(
            Long mediaId,
            ExtractionFailureReason reason
    ) {
        mediaPlaceDao.deleteAllByMediaId(mediaId);
        instagramMediaDao.updateExtractionResult(mediaId, ExtractionStatus.FAILED.name(), reason.name());
    }
}
