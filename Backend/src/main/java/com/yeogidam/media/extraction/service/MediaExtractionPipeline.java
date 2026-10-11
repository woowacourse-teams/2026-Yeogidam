package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.ExtractedPlaces;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.PlaceExtractionResult;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.domain.PlaceSearchHints;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadata;
import com.yeogidam.media.instagram.service.InstagramMetadataService;
import com.yeogidam.place.domain.Place;
import com.yeogidam.place.service.PlaceThumbnailService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MediaExtractionPipeline {

    // 이 계정은 캡션에서 일부 장소를 찾더라도 첨부 콘텐츠의 장소가 누락되지 않도록
    // 처음부터 캡션과 이미지·영상을 함께 분석한다.
    private static final String MEDIA_ANALYSIS_AUTHOR = "with_sol_mate";

    private final InstagramMetadataService instagramMetadataService;
    private final PlaceNameExtractor placeNameExtractor;
    private final PlaceSearcher placeSearcher;
    private final MediaExtractionResultWriter resultWriter;
    private final PlaceThumbnailService placeThumbnailService;

    public void extract(Long mediaId, InstagramUrl instagramUrl) {
        MediaMetadata metadata = instagramMetadataService.readAndStore(mediaId, instagramUrl);
        PlaceSearchHints hints = extractHints(instagramUrl, metadata);
        if (hints.places().isEmpty()) {
            throw new ExtractionFailedException(ExtractionFailureReason.PLACE_NOT_EXTRACTED);
        }
        PlaceExtractionResult result = searchPlaces(hints, metadata.thumbnailKey());
        resultWriter.recordSuccess(mediaId, result);
    }

    private PlaceSearchHints extractHints(InstagramUrl instagramUrl, MediaMetadata metadata) {
        // 캡션에서 장소를 찾으면 이미지·영상 분석을 생략하는 기본 흐름의 예외 대상
        if (MEDIA_ANALYSIS_AUTHOR.equals(metadata.author())) {
            return placeNameExtractor.extractFile(metadata.caption(), instagramUrl);
        }
        PlaceSearchHints hints = placeNameExtractor.extract(metadata.caption());
        if (hints.places().isEmpty()) {
            hints = placeNameExtractor.extractFile(metadata.caption(), instagramUrl);
        }
        return hints;
    }

    private PlaceExtractionResult searchPlaces(PlaceSearchHints hints, String instagramThumbnailKey) {
        List<Place> places = findPlaces(hints, instagramThumbnailKey);
        if (places.isEmpty()) {
            throw new ExtractionFailedException(ExtractionFailureReason.PLACE_NOT_MATCHED);
        }
        return new PlaceExtractionResult(new ExtractedPlaces(places));
    }

    private List<Place> findPlaces(PlaceSearchHints hints, String instagramThumbnailKey) {
        Map<String, Place> placesByKakaoId = new LinkedHashMap<>();
        for (PlaceSearchHint hint : hints.places()) {
            List<Place> matchedPlaces = placeSearcher.search(hint);
            if (matchedPlaces.isEmpty()) {
                continue;
            }
            addPlaces(placesByKakaoId, matchedPlaces, instagramThumbnailKey);
        }
        return List.copyOf(placesByKakaoId.values());
    }

    private void addPlaces(
            Map<String, Place> placesByKakaoId,
            List<Place> places,
            String instagramThumbnailKey
    ) {
        for (Place place : places) {
            addPlaceIfAbsent(placesByKakaoId, place, instagramThumbnailKey);
        }
    }

    private void addPlaceIfAbsent(Map<String, Place> placesByKakaoId, Place place, String instagramThumbnailKey) {
        String kakaoPlaceId = place.externalSource().placeId();
        if (!placesByKakaoId.containsKey(kakaoPlaceId)) {
            placesByKakaoId.put(kakaoPlaceId, placeThumbnailService.resolve(place, instagramThumbnailKey));
        }
    }
}
