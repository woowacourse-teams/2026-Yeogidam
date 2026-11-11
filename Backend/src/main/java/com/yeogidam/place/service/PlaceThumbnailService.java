package com.yeogidam.place.service;

import com.yeogidam.place.domain.MapProvider;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.domain.PlaceThumbnail;
import com.yeogidam.place.infrastructure.KakaoPlaceMetaReader;
import com.yeogidam.place.repository.PlaceDao;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class PlaceThumbnailService {

    private static final String KAKAO_SOURCE = "KAKAO";
    private static final String INSTAGRAM_SOURCE = "INSTAGRAM";

    private final PlaceDao placeDao;
    private final KakaoPlaceMetaReader kakaoPlaceMetaReader;
    private final PlaceThumbnailStore placeThumbnailStore;

    // 장소 썸네일이 없으면 DB에 저장된 썸네일, 카카오 장소 페이지 썸네일 순으로 찾고, 모두 없으면 인스타그램 썸네일을 사용한다.
    // 장소 페이지 사진을 저장할 수 있는 곳은 카카오뿐이라서, 구글처럼 다른 지도 제공자의 장소는 인스타그램 썸네일을 쓴다.
    public Place resolve(Place place, String instagramThumbnailKey) {
        if (hasKey(place.profile().thumbnail())) {
            return place;
        }
        PlaceThumbnail storedThumbnail = placeDao.findThumbnailByExternalSource(place.externalSource())
                .orElse(null);
        if (hasKey(storedThumbnail)) {
            return place.withThumbnail(storedThumbnail);
        }
        if (place.externalSource().mapProvider() == MapProvider.KAKAO) {
            PlaceThumbnail kakaoThumbnail = loadKakaoThumbnail(place);
            if (hasKey(kakaoThumbnail)) {
                return place.withThumbnail(kakaoThumbnail);
            }
        }
        return place.withThumbnail(instagramThumbnail(instagramThumbnailKey));
    }

    private boolean hasKey(PlaceThumbnail thumbnail) {
        return thumbnail != null && thumbnail.key() != null && !thumbnail.key().isBlank();
    }

    private PlaceThumbnail loadKakaoThumbnail(Place place) {
        return readAndStoreKakaoThumbnail(place);
    }

    private PlaceThumbnail readAndStoreKakaoThumbnail(Place place) {
        String imageUrl = kakaoPlaceMetaReader.readMainPhotoUrl(place.externalSource().placeId());
        if (imageUrl == null || imageUrl.isBlank()) {
            return null;
        }
        String key = placeThumbnailStore.store(place.externalSource().placeId(), imageUrl);
        if (key == null || key.isBlank()) {
            return null;
        }
        return new PlaceThumbnail(key, KAKAO_SOURCE);
    }

    private PlaceThumbnail instagramThumbnail(String thumbnailKey) {
        if (thumbnailKey == null || thumbnailKey.isBlank()) {
            return new PlaceThumbnail(null, null);
        }
        return new PlaceThumbnail(thumbnailKey, INSTAGRAM_SOURCE);
    }
}
