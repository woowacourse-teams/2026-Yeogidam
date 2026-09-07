package com.yeogidam;

import java.util.List;
import lombok.Getter;

@Getter
public class InstagramMedia {

    private Long id;

    private final InstagramUrl instagramUrl;
    private final String caption;
    private final ExtractionStatus extractionStatus;
    private final List<Place> places;
    private final ExtractionFailureReason failureReason;

    public InstagramMedia(
            InstagramUrl instagramUrl,
            String caption,
            List<Place> places
    ) {
        validateInstagramUrl(instagramUrl);
        validatePlaces(places);

        this.instagramUrl = instagramUrl;
        this.caption = caption;
        this.extractionStatus = ExtractionStatus.SUCCEEDED;
        this.places = List.copyOf(places);
        this.failureReason = null;
    }

    private void validateInstagramUrl(InstagramUrl instagramUrl) {
        if (instagramUrl == null) {
            throw new IllegalArgumentException("인스타그램 URL은 null일 수 없습니다.");
        }
    }

    private void validatePlaces(List<Place> places) {
        if (places == null || places.isEmpty()) {
            throw new IllegalArgumentException("장소 추출에 성공한 미디어는 장소가 한 개 이상이어야 합니다.");
        }
    }

    public InstagramMedia(
            InstagramUrl instagramUrl,
            String caption,
            ExtractionFailureReason failureReason
    ) {
        validateInstagramUrl(instagramUrl);
        validateFailureReason(failureReason);

        this.instagramUrl = instagramUrl;
        this.caption = caption;
        this.extractionStatus = ExtractionStatus.FAILED;
        this.places = List.of();
        this.failureReason = failureReason;
    }

    private void validateFailureReason(ExtractionFailureReason failureReason) {
        if (failureReason == null) {
            throw new IllegalArgumentException("실패한 미디어는 실패 사유가 필요합니다.");
        }
    }
}
