package com.yeogidam.media.extraction.domain;

/**
 * 게시물 하나의 장소 추출 결과.
 * 진행중·성공·실패가 각자 구현체를 가지므로 상태 분기(else, switch) 없이
 * 전이 규칙이 각 구현체 안에 갇힌다. 성공의 짝 데이터는 추출 사실(ExtractedPlaces)이다.
 */
public interface Extraction {

    ExtractionStatus status();

    Extraction succeed(ExtractedPlaces places);

    Extraction fail(ExtractionFailureReason failureReason);

    Extraction retry();

    ExtractedPlaces places();

    ExtractionFailureReason failureReason();
}
