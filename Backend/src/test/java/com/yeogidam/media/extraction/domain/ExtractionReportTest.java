package com.yeogidam.media.extraction.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.media.extraction.domain.ExtractionReport.KakaoRequest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class ExtractionReportTest {

    private static final Instant STARTED_AT = Instant.parse("2026-10-21T00:00:00Z");
    private static final String URL = "https://www.instagram.com/reel/example/";

    @Test
    void 실제_요청_순서에_맞춰_응답과_후보를_연결하고_미확인과_0건을_구분한다() {
        // given
        ExtractionReport report = new ExtractionReport(123L, STARTED_AT, URL, "prod");
        String rawJson = "{\"places\":[broken";
        report.recordGeminiJson("GEMINI_CAPTION", rawJson);

        // when
        KakaoRequest addressRequest = report.startKakaoRequest("KAKAO_ADDRESS", "연남동", Map.of("size", "1"));
        addressRequest.recordHttpStatus(200);
        addressRequest.recordResponseCount(0);
        KakaoRequest searchRequest = report.startKakaoRequest("KAKAO_SEARCH", "카페 A", Map.of("radius", "3000"));
        searchRequest.recordHttpStatus(503);
        searchRequest.recordCandidate("9090", "제외 후보", "서울 마포구", null, "좌표 오류");

        // then
        Map<String, Object> fields = report.toLogFields();
        List<?> requests = (List<?>) fields.get("kakao_requests");
        Map<?, ?> first = (Map<?, ?>) requests.getFirst();
        Map<?, ?> second = (Map<?, ?>) requests.getLast();
        Map<?, ?> candidate = (Map<?, ?>) ((List<?>) second.get("candidates")).getFirst();
        Map<?, ?> gemini = (Map<?, ?>) ((List<?>) fields.get("gemini_results")).getFirst();
        assertAll(
                () -> assertThat(first.get("query")).isEqualTo("연남동"),
                () -> assertThat(first.get("response_count")).isEqualTo(0),
                () -> assertThat(second.get("query")).isEqualTo("카페 A"),
                () -> assertThat(second.get("http_status")).isEqualTo(503),
                () -> assertThat(second.get("response_count")).isNull(),
                () -> assertThat(candidate.get("kakao_place_id")).isEqualTo("9090"),
                () -> assertThat(candidate.get("road_address")).isNull(),
                () -> assertThat(candidate.get("exclusion_reason")).isEqualTo("좌표 오류"),
                () -> assertThat(gemini.get("raw_json")).isEqualTo(rawJson),
                () -> assertThat(report.failureStage()).isEqualTo("KAKAO_SEARCH")
        );
    }

    @Test
    void 입력_조건과_출력_복사본을_바꿔도_보관한_검색_기록에_영향이_없다() {
        // given
        ExtractionReport report = new ExtractionReport();
        Map<String, String> parameters = new LinkedHashMap<>(Map.of("radius", "3000"));
        KakaoRequest kakaoRequest = report.startKakaoRequest("KAKAO_SEARCH", "카페 A", parameters);
        Map<String, Object> beforeResponse = report.toLogFields();
        kakaoRequest.recordHttpStatus(200);
        kakaoRequest.recordResponseCount(1);
        kakaoRequest.recordCandidate("9090", "카페 A", "서울 마포구", null, null);
        Map<String, Object> fields = report.toLogFields();
        Map<?, ?> request = (Map<?, ?>) ((List<?>) fields.get("kakao_requests")).getFirst();

        // when
        parameters.clear();
        ((Map<?, ?>) request.get("parameters")).clear();
        ((Map<?, ?>) ((List<?>) request.get("candidates")).getFirst()).clear();
        request.clear();
        fields.clear();

        // then
        Map<?, ?> original = (Map<?, ?>) ((List<?>) report.toLogFields().get("kakao_requests")).getFirst();
        Map<?, ?> oldRequest = (Map<?, ?>) ((List<?>) beforeResponse.get("kakao_requests")).getFirst();
        assertAll(
                () -> assertThat(original.get("query")).isEqualTo("카페 A"),
                () -> assertThat(original.get("response_count")).isEqualTo(1),
                () -> assertThat(original.get("parameters")).isEqualTo(Map.of("radius", "3000")),
                () -> assertThat(((Map<?, ?>) ((List<?>) original.get("candidates")).getFirst()).get("name"))
                        .isEqualTo("카페 A"),
                () -> assertThat(oldRequest.get("response_count")).isNull()
        );
    }

    @Test
    void 다음_요청을_추가해도_앞선_요청의_응답과_후보를_해당_요청에_기록한다() {
        // given
        ExtractionReport report = new ExtractionReport();
        KakaoRequest first = report.startKakaoRequest("KAKAO_SEARCH", "카페 A", Map.of());
        KakaoRequest second = report.startKakaoRequest("KAKAO_SEARCH", "카페 B", Map.of());

        // when
        first.recordHttpStatus(200);
        first.recordResponseCount(1);
        first.recordCandidate("9090", "카페 A", "서울 마포구", null, null);
        second.recordHttpStatus(503);

        // then
        List<?> requests = (List<?>) report.toLogFields().get("kakao_requests");
        Map<?, ?> firstFields = (Map<?, ?>) requests.getFirst();
        Map<?, ?> secondFields = (Map<?, ?>) requests.getLast();
        assertAll(
                () -> assertThat(firstFields.get("http_status")).isEqualTo(200),
                () -> assertThat(firstFields.get("response_count")).isEqualTo(1),
                () -> assertThat(((Map<?, ?>) ((List<?>) firstFields.get("candidates")).getFirst()).get("name"))
                        .isEqualTo("카페 A"),
                () -> assertThat(secondFields.get("http_status")).isEqualTo(503),
                () -> assertThat(secondFields.get("response_count")).isNull(),
                () -> assertThat((List<?>) secondFields.get("candidates")).isEmpty()
        );
    }

    @Test
    void 보고서마다_수집한_값과_실패_단계가_섞이지_않는다() {
        // given
        ExtractionReport first = new ExtractionReport();
        ExtractionReport second = new ExtractionReport();

        // when
        first.enterStage("GEMINI_MEDIA");
        first.recordGeminiJson("GEMINI_MEDIA", "{\"places\":[]}");
        first.startKakaoRequest("KAKAO_SEARCH", "카페 A", Map.of());

        // then
        assertAll(
                () -> assertThat(second.failureStage()).isEqualTo("DISPATCH"),
                () -> assertThat((List<?>) second.toLogFields().get("gemini_results")).isEmpty(),
                () -> assertThat((List<?>) second.toLogFields().get("kakao_requests")).isEmpty()
        );
    }

    @Test
    void 실패_로그_필드는_기존_이름과_자료형을_유지한다() {
        // given
        ExtractionReport report = new ExtractionReport(123L, STARTED_AT, URL, "prod");
        report.enterStage("KAKAO_SEARCH");
        Map<String, Object> error = Map.of("type", "ExtractionFailedException", "message", "실패");

        // when
        Map<String, Object> fields = report.toFailureLogFields(ExtractionFailureReason.PLACE_NOT_MATCHED, error);

        // then
        assertAll(
                () -> assertThat(fields).containsEntry("media_id", 123L),
                () -> assertThat(fields).containsEntry("started_at", STARTED_AT.toString()),
                () -> assertThat(fields).containsEntry("instagram_url", URL),
                () -> assertThat(fields).containsEntry("environment", "prod"),
                () -> assertThat(fields).containsEntry("analysis_status", "FAILED"),
                () -> assertThat(fields).containsEntry("failure_reason", "PLACE_NOT_MATCHED"),
                () -> assertThat(fields).containsEntry("failure_stage", "KAKAO_SEARCH"),
                () -> assertThat(fields).containsEntry("error", error)
        );
    }
}
