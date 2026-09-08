package com.yeogidam.media.domain;

/**
 * 릴스 하나의 장소 추출 결과.
 * 진행중·성공·실패가 각자 구현체를 가지므로 상태 분기(else, switch) 없이
 * 전이 규칙이 각 구현체 안에 갇힌다.
 */
public interface Extraction {

    ExtractionStatus status();

    Extraction succeed(ExtractedPlaces extractedPlaces);

    Extraction fail(ExtractionFailureReason failureReason);

    Extraction retry();

    ExtractedPlaces extractedPlaces();

    ExtractionFailureReason failureReason();
}
