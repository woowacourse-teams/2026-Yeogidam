package com.yeogidam.media.extraction.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 분석 한 건의 관측값을 보관한다. 장소 선택, 실패 판정과 로그 출력은 호출자가 담당한다. */
public final class ExtractionReport {

    private final Long mediaId;
    private final Instant startedAt;
    private final String instagramUrl;
    private final String environment;
    private final List<GeminiResult> geminiResults = new ArrayList<>();
    private final List<KakaoRequest> kakaoRequests = new ArrayList<>();

    private String failureStage = "DISPATCH";

    public ExtractionReport() {
        this(null, null, null, null);
    }

    public ExtractionReport(Long mediaId, Instant startedAt, String instagramUrl, String environment) {
        this.mediaId = mediaId;
        this.startedAt = startedAt;
        this.instagramUrl = instagramUrl;
        this.environment = environment;
    }

    public void enterStage(String stage) {
        failureStage = stage;
    }

    public void recordGeminiJson(String stage, String rawJson) {
        geminiResults.add(new GeminiResult(stage, rawJson));
    }

    public KakaoRequest startKakaoRequest(
            String stage,
            String query,
            Map<String, String> parameters
    ) {
        enterStage(stage);
        KakaoRequest request = new KakaoRequest(stage, query, parameters);
        kakaoRequests.add(request);
        return request;
    }

    public Map<String, Object> toLogFields() {
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("media_id", mediaId);
        fields.put("started_at", startedAtText());
        fields.put("instagram_url", instagramUrl);
        fields.put("environment", environment);
        fields.put("failure_stage", failureStage);
        fields.put("gemini_results", geminiResults.stream()
                .map(GeminiResult::toLogFields)
                .toList());
        fields.put("kakao_requests", kakaoRequests.stream()
                .map(KakaoRequest::toLogFields)
                .toList());
        return fields;
    }

    private String startedAtText() {
        if (startedAt == null) {
            return null;
        }
        return startedAt.toString();
    }

    public Map<String, Object> toFailureLogFields(ExtractionFailureReason reason, Map<String, Object> error) {
        Map<String, Object> fields = toLogFields();
        fields.put("analysis_status", "FAILED");
        fields.put("failure_reason", reason.name());
        fields.put("error", error);
        return fields;
    }

    public Long mediaId() {
        return mediaId;
    }

    public Instant startedAt() {
        return startedAt;
    }

    public String failureStage() {
        return failureStage;
    }

    private record GeminiResult(String stage, String rawJson) {

        private Map<String, Object> toLogFields() {
            Map<String, Object> fields = new LinkedHashMap<>();
            fields.put("stage", stage);
            fields.put("raw_json", rawJson);
            return fields;
        }
    }

    public static final class KakaoRequest {

        private final String stage;
        private final String query;
        private final Map<String, String> parameters;
        private final List<KakaoCandidate> candidates = new ArrayList<>();

        private Integer httpStatus;
        private Integer responseCount;

        private KakaoRequest(String stage, String query, Map<String, String> parameters) {
            this.stage = stage;
            this.query = query;
            this.parameters = new LinkedHashMap<>(parameters);
        }

        public void recordHttpStatus(int httpStatus) {
            this.httpStatus = httpStatus;
        }

        public void recordResponseCount(Integer responseCount) {
            this.responseCount = responseCount;
        }

        public void recordCandidate(
                String kakaoPlaceId,
                String name,
                String address,
                String roadAddress,
                String exclusionReason
        ) {
            candidates.add(new KakaoCandidate(kakaoPlaceId, name, address, roadAddress, exclusionReason));
        }

        private Map<String, Object> toLogFields() {
            Map<String, Object> fields = new LinkedHashMap<>();
            fields.put("stage", stage);
            fields.put("query", query);
            fields.put("parameters", new LinkedHashMap<>(parameters));
            fields.put("http_status", httpStatus);
            fields.put("response_count", responseCount);
            fields.put("candidates", candidates.stream()
                    .map(KakaoCandidate::toLogFields)
                    .toList());
            return fields;
        }
    }

    private record KakaoCandidate(String kakaoPlaceId, String name, String address, String roadAddress,
                                  String exclusionReason) {

        private Map<String, Object> toLogFields() {
            Map<String, Object> fields = new LinkedHashMap<>();
            fields.put("kakao_place_id", kakaoPlaceId);
            fields.put("name", name);
            fields.put("address", address);
            fields.put("road_address", roadAddress);
            fields.put("exclusion_reason", exclusionReason);
            return fields;
        }
    }
}
