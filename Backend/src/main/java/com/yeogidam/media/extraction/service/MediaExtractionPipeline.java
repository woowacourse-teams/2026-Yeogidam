package com.yeogidam.media.extraction.service;

import com.yeogidam.media.extraction.domain.ExtractedPlaces;
import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionReport;
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
    // 처음부터 캡션과 이미지, 영상을 함께 분석한다.
    private static final String MEDIA_ANALYSIS_AUTHOR = "with_sol_mate";

    private final InstagramMetadataService instagramMetadataService;
    private final PlaceNameExtractor placeNameExtractor;
    private final PlaceSearcher placeSearcher;
    private final MediaExtractionResultWriter resultWriter;
    private final PlaceThumbnailService placeThumbnailService;

    public void extract(Long mediaId, InstagramUrl instagramUrl) {
        extract(mediaId, instagramUrl, new ExtractionReport());
    }

    public void extract(
            Long mediaId,
            InstagramUrl instagramUrl,
            ExtractionReport report
    ) {
        report.enterStage("CONTENT_FETCH");
        MediaMetadata metadata = instagramMetadataService.readAndStore(mediaId, instagramUrl, report);
        List<Place> places = findPlacesFromCaptionThenMedia(instagramUrl, metadata, report);
        report.enterStage("RESULT_SAVE");
        resultWriter.recordSuccess(mediaId, new PlaceExtractionResult(new ExtractedPlaces(places)));
    }

    // 캡션 단서가 없거나 캡션 단서로 지도에서 장소를 하나도 못 찾으면 캡션과 영상, 사진을 함께 다시 읽는다.
    private List<Place> findPlacesFromCaptionThenMedia(
            InstagramUrl instagramUrl,
            MediaMetadata metadata,
            ExtractionReport report
    ) {
        if (MEDIA_ANALYSIS_AUTHOR.equals(metadata.author())) {
            return findPlacesInMedia(instagramUrl, metadata, ExtractionFailureReason.PLACE_NOT_EXTRACTED,
                    "GEMINI_MEDIA", report);
        }
        report.enterStage("GEMINI_CAPTION");
        PlaceSearchHints captionHints = placeNameExtractor.extract(metadata.caption(), report);
        if (captionHints.places().isEmpty()) {
            return findPlacesInMedia(instagramUrl, metadata, ExtractionFailureReason.PLACE_NOT_EXTRACTED,
                    "GEMINI_MEDIA", report);
        }
        List<Place> places = findPlaces(captionHints, metadata.thumbnailKey(), report);
        if (!places.isEmpty()) {
            return places;
        }
        return findPlacesInMedia(instagramUrl, metadata, ExtractionFailureReason.PLACE_NOT_MATCHED,
                "KAKAO_SEARCH", report);
    }

    // 첨부에서도 단서가 없으면 noHintsReason으로 실패한다. 캡션 단서가 지도에 없어서 첨부를 읽은 경우라면 PLACE_NOT_MATCHED다.
    private List<Place> findPlacesInMedia(
            InstagramUrl instagramUrl,
            MediaMetadata metadata,
            ExtractionFailureReason noHintsReason,
            String noHintsStage,
            ExtractionReport report
    ) {
        report.enterStage("GEMINI_MEDIA");
        PlaceSearchHints mediaHints = placeNameExtractor.extractFile(metadata.caption(), instagramUrl, report);
        if (mediaHints.places().isEmpty()) {
            report.enterStage(noHintsStage);
            throw new ExtractionFailedException(noHintsReason);
        }
        List<Place> places = findPlaces(mediaHints, metadata.thumbnailKey(), report);
        if (places.isEmpty()) {
            report.enterStage("KAKAO_SEARCH");
            throw new ExtractionFailedException(ExtractionFailureReason.PLACE_NOT_MATCHED);
        }
        return places;
    }

    private List<Place> findPlaces(
            PlaceSearchHints hints,
            String instagramThumbnailKey,
            ExtractionReport report
    ) {
        Map<String, Place> placesByKakaoId = new LinkedHashMap<>();
        for (PlaceSearchHint hint : hints.places()) {
            report.enterStage("KAKAO_SEARCH");
            List<Place> matchedPlaces = placeSearcher.search(hint, report);
            if (matchedPlaces.isEmpty()) {
                continue;
            }
            addPlaces(placesByKakaoId, matchedPlaces, instagramThumbnailKey, report);
        }
        return List.copyOf(placesByKakaoId.values());
    }

    private void addPlaces(
            Map<String, Place> placesByKakaoId,
            List<Place> places,
            String instagramThumbnailKey,
            ExtractionReport report
    ) {
        for (Place place : places) {
            addPlaceIfAbsent(placesByKakaoId, place, instagramThumbnailKey, report);
        }
    }

    private void addPlaceIfAbsent(
            Map<String, Place> placesByKakaoId,
            Place place,
            String instagramThumbnailKey,
            ExtractionReport report
    ) {
        String kakaoPlaceId = place.externalSource().placeId();
        if (!placesByKakaoId.containsKey(kakaoPlaceId)) {
            report.enterStage("PLACE_THUMBNAIL");
            placesByKakaoId.put(kakaoPlaceId, placeThumbnailService.resolve(place, instagramThumbnailKey));
        }
    }
}
