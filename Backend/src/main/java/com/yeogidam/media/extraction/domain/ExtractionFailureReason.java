package com.yeogidam.media.extraction.domain;

/**
 * 사유는 운영에서 관측된 것부터 만든다(ADR-01 결정 4와 같은 기준).
 * 관측: 원본 조회 실패, 장소 미추출, 지도 미매칭. 나머지는 UNEXPECTED로 모은다.
 */
public enum ExtractionFailureReason {

    CONTENT_UNAVAILABLE("원본 릴스를 불러오지 못했어요"),
    PLACE_NOT_EXTRACTED("릴스에서 장소 정보를 찾지 못했어요"),
    PLACE_NOT_MATCHED("지도에서 장소를 찾지 못했어요"),
    UNEXPECTED("알 수 없는 문제가 발생했어요");

    private final String description;

    ExtractionFailureReason(String description) {
        this.description = description;
    }

    public String description() {
        return description;
    }
}
