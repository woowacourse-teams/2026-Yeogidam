package com.yeogidam.media.extraction.eval;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.yeogidam.media.extraction.config.ExtractionConfig;
import com.yeogidam.media.extraction.config.GeminiProperties;
import com.yeogidam.media.extraction.config.KakaoLocalProperties;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.infrastructure.GeminiFileClient;
import com.yeogidam.media.extraction.infrastructure.GeminiPlaceNameExtractor;
import com.yeogidam.media.extraction.infrastructure.KakaoPlaceSearcher;
import com.yeogidam.media.instagram.config.InstagramConfig;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadataWithUrl;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaDownloader;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaHtmlReader;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaSourceReader;
import com.yeogidam.place.domain.Place;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 골든셋(eval/golden/cases.csv)을 운영 인프라 클래스로 돌려 eval/results/summary.md를 쓴다.
 * 인스타그램 페이지 읽기, 원본 입수, Gemini 추출, 카카오 검색을 운영과 같은 클래스와 설정으로 부르고,
 * MediaExtractionPipeline과 같은 순서(캡션 → 단서 0건이거나 카카오 0건이면 캡션과 영상, 사진)로 고른다.
 * DB와 S3 저장은 제외하고, Gemini 분석 요청에는 평가 전용 5초 간격을 적용한다.
 * 외부 API를 부르므로 기본 test에서는 빼고 `./gradlew evalTest --no-daemon`으로만 돌린다. 이력은 git이 든다.
 */
@Tag("eval")
class GoldenSetEvalTest {

    private static final Path EVAL_ROOT = Path.of("eval");
    private static final Path CASES_FILE = EVAL_ROOT.resolve("golden/cases.csv");
    private static final Path RESULTS_DIR = EVAL_ROOT.resolve("results");
    private static final Path SUMMARY_FILE = RESULTS_DIR.resolve("summary.md");
    private static final Path ENV_FILE = Path.of(".env");
    private static final long PAUSE_BETWEEN_CASES_MILLIS = 1_000;
    private static final Map<String, String> KIND_LABELS = Map.of(
            "video", "영상 전용 릴스",
            "caption", "캡션에 장소가 있는 릴스",
            "image", "사진 게시물",
            "multi", "모음 게시물 (장소 3곳 이상)",
            "none", "확정된 지도 정답이 없는 게시물");
    private static final List<String> KIND_ORDER = List.of("video", "caption", "image", "multi", "none");
    private static final String MEDIA_ANALYSIS_AUTHOR = "with_sol_mate";

    @Test
    void 골든셋을_운영_빈으로_돌려_채점표를_쓴다() throws IOException {
        String savedResults = System.getProperty("eval.results-file", "");
        if (!savedResults.isBlank()) {
            rescoreSavedResults(Path.of(savedResults));
            return;
        }
        Map<String, String> env = readEnv();
        assumeTrue(env.containsKey("GEMINI_API_KEY") && env.containsKey("KAKAO_CLIENT_ID"),
                ".env에 GEMINI_API_KEY와 KAKAO_CLIENT_ID가 있어야 돌릴 수 있습니다");

        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(
                new InstagramConfig().instagramRestClient(RestClient.builder()));
        ExtractionConfig extractionConfig = new ExtractionConfig();
        JsonMapper jsonMapper = JsonMapper.builder().build();
        List<String> fallbackApiKeys = splitKeys(env.getOrDefault("GEMINI_API_KEY_FALLBACKS", ""));
        GeminiEvalRequestLimiter requestLimiter = new GeminiEvalRequestLimiter();
        RestClient instagramMediaRestClient = extractionConfig.instagramMediaRestClient(RestClient.builder());
        RestClient geminiMediaRestClient = extractionConfig.geminiMediaRestClient(
                RestClient.builder().requestInterceptor(requestLimiter));
        GeminiPlaceNameExtractor extractor = new GeminiPlaceNameExtractor(
                extractionConfig.geminiRestClient(RestClient.builder().requestInterceptor(requestLimiter)),
                new GeminiProperties(env.get("GEMINI_API_KEY"), env.get("GEMINI_MODEL"), fallbackApiKeys),
                jsonMapper,
                Clock.systemUTC(),
                geminiMediaRestClient,
                new InstagramMediaDownloader(new InstagramMediaSourceReader(instagramMediaRestClient, jsonMapper),
                        instagramMediaRestClient),
                new GeminiFileClient(geminiMediaRestClient));
        KakaoPlaceSearcher searcher = new KakaoPlaceSearcher(
                extractionConfig.kakaoLocalRestClient(RestClient.builder()),
                new KakaoLocalProperties(env.get("KAKAO_CLIENT_ID")));
        System.out.println("Gemini key: 먼저 부르는 key 1개, 막히면 넘기는 결제 key " + fallbackApiKeys.size() + "개");

        List<GoldenCase> cases = readCases();
        String only = System.getProperty("eval.cases", "");
        if (!only.isBlank()) {
            cases = cases.stream().filter(c -> List.of(only.split(",")).contains(c.caseId())).toList();
        }
        if (cases.isEmpty()) {
            throw new IllegalArgumentException("평가할 골든셋 사례가 없습니다: " + only);
        }
        List<CaseResult> results = new ArrayList<>();
        Path rawFile = Path.of("build/eval/both-partial.json");
        if (only.isBlank()) {
            rawFile = RESULTS_DIR.resolve("both.json");
        }
        writeResults(jsonMapper, rawFile, env.get("GEMINI_MODEL"), cases, results, false);
        for (GoldenCase goldenCase : cases) {
            long started = System.currentTimeMillis();
            CaseResult result = run(goldenCase, reader, extractor, searcher)
                    .withSeconds((System.currentTimeMillis() - started) / 1000.0);
            results.add(result);
            writeResults(jsonMapper, rawFile, env.get("GEMINI_MODEL"), cases, results, false);
            System.out.println(result.line());
            pause();
        }
        writeResults(jsonMapper, rawFile, env.get("GEMINI_MODEL"), cases, results, true);
        if (!only.isBlank()) {
            return;   // 몇 건만 돌린 결과로 전체 채점표를 덮어쓰지 않는다
        }
        Files.createDirectories(RESULTS_DIR);
        Files.writeString(SUMMARY_FILE, render(env.get("GEMINI_MODEL"), results));
        System.out.println("채점표: " + SUMMARY_FILE.toAbsolutePath());
    }

    void writeResults(
            JsonMapper mapper,
            Path file,
            String model,
            List<GoldenCase> cases,
            List<CaseResult> results,
            boolean complete
    ) throws IOException {
        Files.createDirectories(file.getParent());
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("schemaVersion", 1);
        record.put("runner", "java-operational");
        record.put("inputStrategy", "caption_then_media");
        record.put("recordedAt", Instant.now().toString());
        record.put("model", model);
        record.put("goldenSha256", goldenHash());
        record.put("plannedCaseIds", cases.stream().map(GoldenCase::caseId).toList());
        record.put("complete", complete);
        record.put("rows", results);
        Files.writeString(file, mapper.writerWithDefaultPrettyPrinter().writeValueAsString(record) + "\n");
    }

    private String goldenHash() throws IOException {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(CASES_FILE)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    void rescoreSavedResults(Path file) throws IOException {
        JsonMapper mapper = JsonMapper.builder().build();
        JsonNode saved = mapper.readTree(Files.readString(file));
        if (!"java-operational".equals(saved.path("runner").asString())
                || saved.path("schemaVersion").asInt() != 1
                || !"caption_then_media".equals(saved.path("inputStrategy").asString())) {
            throw new IllegalArgumentException("Java 운영 흐름으로 실행한 평가 결과만 재채점할 수 있습니다.");
        }
        List<GoldenCase> cases = readCases();
        List<CaseResult> results = readSavedResults(saved, cases);
        if (!saved.path("complete").asBoolean() || results.size() != cases.size()
                || results.stream().map(result -> result.goldenCase().caseId()).distinct().count() != cases.size()) {
            throw new IllegalArgumentException("전체 사례의 완료 결과가 필요합니다. 부분 실행으로 전체 채점표를 갱신하지 않습니다.");
        }
        String report = render(saved.path("model").asString(), results);
        report += "\n- 외부 API 재호출 없이 `" + file.getFileName() + "`의 예측을 현재 정답으로 다시 채점했다.\n";
        report += "- 원시 실행 기록 시각: " + saved.path("recordedAt").asString() + ". 현재 정답 SHA-256: " + goldenHash() + ".\n";
        Files.writeString(SUMMARY_FILE, report);
    }

    List<CaseResult> readSavedResults(JsonNode saved, List<GoldenCase> cases) {
        Map<String, GoldenCase> byId = new LinkedHashMap<>();
        cases.forEach(golden -> byId.put(golden.caseId(), golden));
        List<CaseResult> results = new ArrayList<>();
        for (JsonNode row : saved.path("rows")) {
            GoldenCase golden = byId.get(row.path("goldenCase").path("caseId").asString());
            if (golden == null) {
                throw new IllegalArgumentException("저장된 결과에 현재 골든셋에 없는 사례가 있습니다.");
            }
            if (!golden.url().equals(row.path("goldenCase").path("url").asString())) {
                throw new IllegalArgumentException("사례 ID의 게시물 URL이 변경되어 저장된 예측을 재사용할 수 없습니다.");
            }
            List<PredictedPlace> predicted = new ArrayList<>();
            for (JsonNode place : row.path("predicted")) {
                predicted.add(new PredictedPlace(place.path("id").asString(), place.path("name").asString(),
                        place.path("address").asString()));
            }
            results.add(new CaseResult(golden, predicted, List.of(), row.path("stage").asString(),
                    row.path("path").asString(), row.path("seconds").asDouble()));
        }
        return results;
    }

    // MediaExtractionPipeline.findPlacesFromCaptionThenMedia와 같은 순서로 돌린다
    private CaseResult run(
            GoldenCase goldenCase,
            InstagramMediaHtmlReader reader,
            GeminiPlaceNameExtractor extractor,
            KakaoPlaceSearcher searcher
    ) {
        InstagramUrl url = new InstagramUrl(goldenCase.url());
        MediaMetadataWithUrl metadata;
        try {
            metadata = reader.read(url);
        } catch (RuntimeException exception) {
            return CaseResult.of(goldenCase, "수집 실패: " + describe(exception));
        }
        String caption = metadata.caption();
        if (caption == null || caption.isBlank()) {
            // 운영의 InstagramMetadataService는 캡션이 없으면 CONTENT_UNAVAILABLE로 실패시킨다
            return CaseResult.of(goldenCase, "수집 실패: 캡션 없음");
        }
        // 지정 작성자는 운영에서 캡션 단계를 건너뛰고 바로 첨부를 읽는다
        boolean mediaFirst = MEDIA_ANALYSIS_AUTHOR.equals(metadata.author());
        List<PlaceSearchHint> captionHints = List.of();
        if (!mediaFirst) {
            try {
                captionHints = extractor.extract(caption).places();
                List<PredictedPlace> places = findPlaces(captionHints, searcher);
                if (!places.isEmpty()) {
                    return CaseResult.of(goldenCase, captionHints, places, "캡션");
                }
            } catch (RuntimeException exception) {
                return CaseResult.failed(goldenCase, captionHints, describe(exception), "캡션");
            }
        }
        String path = mediaPath(mediaFirst, captionHints);
        try {
            List<PlaceSearchHint> hints = extractor.extractFile(caption, url).places();
            return CaseResult.of(goldenCase, hints, findPlaces(hints, searcher), path);
        } catch (RuntimeException exception) {
            return CaseResult.failed(goldenCase, captionHints, describe(exception), path);
        }
    }

    private String mediaPath(boolean mediaFirst, List<PlaceSearchHint> captionHints) {
        if (mediaFirst) {
            return "첨부";
        }
        if (captionHints.isEmpty()) {
            return "캡션→첨부";
        }
        return "캡션→카카오0건→첨부";
    }

    /** 원인 예외까지 메시지를 이어 붙인다. 운영 예외 메시지만으로는 어느 호출이 왜 실패했는지 모른다. */
    private static String describe(Throwable exception) {
        StringBuilder text = new StringBuilder(exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage());
        for (Throwable cause = exception.getCause(); cause != null; cause = cause.getCause()) {
            text.append(" <- ").append(cause.getMessage() == null ? cause.getClass().getSimpleName() : cause.getMessage());
        }
        return text.toString();
    }

    /** MediaExtractionPipeline.findPlaces와 같다. 단서마다 검색하고 카카오 ID로 중복을 뺀다. */
    private List<PredictedPlace> findPlaces(List<PlaceSearchHint> hints, KakaoPlaceSearcher searcher) {
        Map<String, PredictedPlace> placesByKakaoId = new LinkedHashMap<>();
        for (PlaceSearchHint hint : hints) {
            for (Place place : searcher.search(hint)) {
                placesByKakaoId.putIfAbsent(place.externalSource().placeId(), PredictedPlace.from(place));
            }
        }
        return List.copyOf(placesByKakaoId.values());
    }

    String render(String model, List<CaseResult> pipeline) {
        StringBuilder out = new StringBuilder();
        int expected = pipeline.stream().mapToInt(result -> result.goldenCase().expectedIds().size()).sum();
        int observed = pipeline.stream().mapToInt(result -> result.goldenCase().observedNames().size()).sum();
        long verified = pipeline.stream().filter(result -> result.goldenCase().isVerified()).count();
        int verifiedExpected = pipeline.stream()
                .filter(result -> result.goldenCase().isVerified())
                .mapToInt(result -> result.goldenCase().expectedIds().size())
                .sum();
        out.append("# 골든셋 채점 결과\n\n");
        out.append("갱신 ").append(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
                .append(", 모델 ").append(model).append(". 실행 ").append(pipeline.size()).append("건, 기록된 소개 장소 ")
                .append(observed).append("항목, 지도 정답 ").append(expected).append("곳(미검증 기록 포함)이다. ")
                .append("검증 근거는 `../golden/verification-20261016.md`, 원시 예측은 `both.json`에 있다.\n\n");
        out.append("추출 대상은 음식점, 소품샵, 전시회 등 지도에서 찾을 수 있는 장소다. ")
                .append("검증 완료 ").append(verified).append("건의 지도 정답 ").append(verifiedExpected)
                .append("곳만 집계하므로 전체 소개 장소의 추출 성능으로 해석하지 않는다. 원본 접근 불가 또는 지도 ID 미확정 사례는 ")
                .append("숫자에서 제외하고 아래에 잠정 결과로 남긴다. 소개 장소 전체는 검증 문서의 장소별 근거에 보존한다.\n\n");
        out.append("칸은 맞힌 지도 장소 / 지도 정답과 오탐 수다. 수집 실패는 분모에서 제외하되 별도 집계하며, ")
                .append("분석 실패는 미검출로 남긴다. 정답 없는 사례의 분석 실패도 정상 빈 결과와 구분한다. ")
                .append("카카오 웹에서 확인했으나 검증에 사용한 검색어로 API에서 확인하지 못한 ID는 별도 표시한다.\n\n");
        out.append("| 게시물 종류 (전체 건수) | 현재 운영 흐름 |\n");
        out.append("|---|---|\n");
        for (String kind : KIND_ORDER) {
            long count = pipeline.stream().filter(result -> result.goldenCase().kind().equals(kind)).count();
            out.append("| ").append(KIND_LABELS.get(kind)).append(" (").append(count).append(") | ")
                    .append(cell(ofKind(pipeline, kind))).append(" |\n");
        }
        out.append("| 전체 (").append(pipeline.size()).append(") | ")
                .append(cell(pipeline)).append(" |\n\n");
        List<CaseResult> mediaCases = pipeline.stream().filter(result -> result.path().contains("첨부")).toList();
        out.append(String.format("- 지금 코드는 %d건 가운데 %d건에서 영상과 사진까지 읽었다. 한 건 처리에 평균 %.0f초, 영상과 사진까지 읽은 건은 평균 %.0f초가 걸렸다.%n",
                pipeline.size(), mediaCases.size(), averageSeconds(pipeline), averageSeconds(mediaCases)));
        out.append("- 운영 코드는 변경하지 않았다. 캡션에서 한 곳이라도 찾으면 첨부를 생략하므로 전체 소개 장소를 놓칠 수 있다.\n");
        out.append("- Gemini 응답은 실행마다 달라질 수 있다. 부분 실행도 원시 결과를 저장하지만 전체 채점표는 덮어쓰지 않는다.\n\n");
        appendVerificationDiagnostics(out, pipeline);
        out.append("## 실패, 누락 및 미검증 사례의 잠정 결과\n\n");
        pipeline.stream()
                .filter(CaseResult::hasProblem)
                .forEach(result -> out.append(result.summaryLine()).append("\n"));
        return out.toString();
    }

    private void appendVerificationDiagnostics(StringBuilder out, List<CaseResult> results) {
        out.append("## 검증 상태별 지도 ID 대조 (참고)\n\n")
                .append("미검증 사례도 기록된 ID와 대조하되, 전체 소개 장소의 정답률이나 추가 예측의 오탐 판정으로 해석하지 않는다. ")
                .append("SOURCE_UNAVAILABLE은 이번에 원본을 확보하지 못한 과거 ID다.\n\n")
                .append("| 검증 상태 | 게시물 | 기록된 지도 ID와 일치 |\n|---|---|---|\n");
        for (String status : List.of("VERIFIED", "PARTIAL", "SOURCE_UNAVAILABLE")) {
            List<CaseResult> rows = results.stream()
                    .filter(result -> result.goldenCase().verificationStatus().equals(status))
                    .toList();
            int hit = rows.stream().mapToInt(result -> result.hitIds().size()).sum();
            int expected = rows.stream().mapToInt(result -> result.goldenCase().expectedIds().size()).sum();
            out.append("| ").append(status).append(" | ").append(rows.size()).append(" | ")
                    .append(hit).append("/").append(expected).append(" |\n");
        }
        out.append("\n");
    }

    private List<CaseResult> ofKind(List<CaseResult> results, String kind) {
        return results.stream()
                .filter(result -> result.goldenCase().kind().equals(kind))
                .toList();
    }

    String cell(List<CaseResult> rows) {
        if (rows.isEmpty()) {
            return "기록 없음";
        }
        List<CaseResult> verified = rows.stream().filter(result -> result.goldenCase().isVerified()).toList();
        List<CaseResult> scored = verified.stream().filter(result -> !result.isFetchFailed()).toList();
        int expected = scored.stream().mapToInt(r -> r.goldenCase().expectedIds().size()).sum();
        int hit = scored.stream().mapToInt(r -> r.hitIds().size()).sum();
        int wrong = scored.stream().mapToInt(r -> r.wrongIds().size()).sum();
        int apiMissing = scored.stream().mapToInt(r -> r.apiMissingMissedIds().size()).sum();
        String text = "지도 정답 없음";
        if (expected > 0) {
            text = Math.round(100.0 * hit / expected) + "% (" + hit + "/" + expected + ")";
        }
        text += ", 틀리게 뽑음 " + wrong;
        text += ", 완전 일치 " + scored.stream().filter(CaseResult::isExactMatch).count() + "/" + scored.size();
        text += ", 수집 실패 " + rows.stream().filter(CaseResult::isFetchFailed).count();
        text += ", 처리 실패 " + rows.stream().filter(CaseResult::isProcessingFailed).count();
        text += ", 미검증 " + (rows.size() - verified.size());
        if (apiMissing > 0) {
            text += ", 카카오 검색 API 미확인 " + apiMissing;
        }
        return text;
    }

    private double averageSeconds(List<CaseResult> results) {
        return results.stream().mapToDouble(CaseResult::seconds).average().orElse(0);
    }

    private void pause() {
        try {
            Thread.sleep(PAUSE_BETWEEN_CASES_MILLIS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    private Map<String, String> readEnv() throws IOException {
        Map<String, String> env = new LinkedHashMap<>(System.getenv());
        if (!Files.exists(ENV_FILE)) {
            return env;
        }
        for (String line : Files.readAllLines(ENV_FILE)) {
            int separator = line.indexOf('=');
            if (line.isBlank() || line.startsWith("#") || separator < 0) {
                continue;
            }
            env.put(line.substring(0, separator).trim(), line.substring(separator + 1).trim().replaceAll("^\"|\"$", ""));
        }
        return env;
    }

    List<GoldenCase> readCases() throws IOException {
        List<List<String>> rows = parseCsv(Files.readString(CASES_FILE));
        List<String> header = rows.getFirst();
        List<GoldenCase> cases = new ArrayList<>();
        for (List<String> row : rows.subList(1, rows.size())) {
            Map<String, String> columns = new LinkedHashMap<>();
            for (int i = 0; i < header.size(); i++) {
                columns.put(header.get(i), i < row.size() ? row.get(i) : "");
            }
            cases.add(new GoldenCase(
                    columns.get("case_id"),
                    columns.get("url"),
                    columns.get("kind"),
                    splitIds(columns.get("expected_kakao_place_ids")),
                    splitIds(columns.get("expected_names")),
                    splitIds(columns.get("kakao_api_missing_ids")),
                    columns.get("verification_status"),
                    splitIds(columns.get("observed_place_names")),
                    readAliases(columns.getOrDefault("accepted_kakao_aliases", ""))));
        }
        return cases;
    }

    private static List<String> splitKeys(String value) {
        return Arrays.stream(value.split(","))
                .map(String::strip)
                .filter(key -> !key.isEmpty())
                .toList();
    }

    private static List<String> splitIds(String value) {
        return value.isBlank() ? List.of() : List.of(value.split(";"));
    }

    private static Map<String, String> readAliases(String value) {
        Map<String, String> aliases = new LinkedHashMap<>();
        for (String pair : splitIds(value)) {
            int separator = pair.indexOf('=');
            if (separator <= 0 || separator == pair.length() - 1) {
                throw new IllegalArgumentException("지도 별칭은 별칭ID=정답ID 형식이어야 합니다.");
            }
            aliases.put(pair.substring(0, separator), pair.substring(separator + 1));
        }
        return Map.copyOf(aliases);
    }

    /** 따옴표 안의 쉼표와 줄바꿈, 겹따옴표("")를 처리하는 최소한의 CSV 읽기. */
    private static List<List<String>> parseCsv(String text) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < text.length() && text.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else if (c == '"') {
                    quoted = false;
                } else {
                    field.append(c);
                }
                continue;
            }
            if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                row.add(field.toString());
                field.setLength(0);
            } else if (c == '\n') {
                row.add(field.toString());
                field.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
            } else if (c != '\r') {
                field.append(c);
            }
        }
        if (!field.isEmpty() || !row.isEmpty()) {
            row.add(field.toString());
            rows.add(row);
        }
        return rows;
    }

    record GoldenCase(
            String caseId,
            String url,
            String kind,
            List<String> expectedIds,
            List<String> expectedNames,
            List<String> apiMissingIds,
            String verificationStatus,
            List<String> observedNames,
            Map<String, String> acceptedAliases
    ) {

        GoldenCase {
            if (expectedIds.size() != expectedNames.size() || new LinkedHashSet<>(expectedIds).size() != expectedIds.size()) {
                throw new IllegalArgumentException(caseId + ": 정답 ID와 이름의 대응 또는 중복을 확인해야 합니다.");
            }
            if (!expectedIds.containsAll(apiMissingIds) || !KIND_ORDER.contains(kind)
                    || !List.of("VERIFIED", "PARTIAL", "SOURCE_UNAVAILABLE").contains(verificationStatus)) {
                throw new IllegalArgumentException(caseId + ": 골든셋 종류, 검증 상태 또는 API 미제공 ID가 잘못됐습니다.");
            }
            if (!expectedIds.containsAll(acceptedAliases.values())) {
                throw new IllegalArgumentException(caseId + ": 지도 별칭의 대상은 정답 ID여야 합니다.");
            }
        }

        boolean isVerified() {
            return "VERIFIED".equals(verificationStatus);
        }

        String canonicalIdOf(String id) {
            return acceptedAliases.getOrDefault(id, id);
        }

        String nameOf(String id) {
            int index = expectedIds.indexOf(id);
            if (index < 0 || index >= expectedNames.size()) {
                return id;
            }
            return expectedNames.get(index);
        }
    }

    record PredictedPlace(
            String id,
            String name,
            String address
    ) {

        static PredictedPlace from(Place place) {
            return new PredictedPlace(place.externalSource().placeId(), place.profile().name().value(),
                    place.profile().address().landLotAddress());
        }
    }

    record CaseResult(
            GoldenCase goldenCase,
            List<PredictedPlace> predicted,
            List<PlaceSearchHint> hints,
            String stage,
            String path,
            double seconds
    ) {

        static CaseResult of(GoldenCase goldenCase, String stage) {
            return new CaseResult(goldenCase, List.of(), List.of(), stage, "-", 0);
        }

        static CaseResult of(GoldenCase goldenCase, List<PlaceSearchHint> hints, List<PredictedPlace> predicted, String path) {
            String stage = "ok";
            if (hints.isEmpty()) {
                stage = "추출 0건";
            } else if (predicted.isEmpty()) {
                stage = "카카오 0건";
            }
            return new CaseResult(goldenCase, predicted, hints, stage, path, 0);
        }

        static CaseResult failed(GoldenCase goldenCase, List<PlaceSearchHint> hints, String reason, String path) {
            return new CaseResult(goldenCase, List.of(), hints, "처리 실패: " + reason, path, 0);
        }

        CaseResult withSeconds(double value) {
            return new CaseResult(goldenCase, predicted, hints, stage, path, value);
        }

        boolean isFetchFailed() {
            return stage.startsWith("수집 실패");
        }

        boolean isProcessingFailed() {
            return stage.startsWith("처리 실패");
        }

        boolean isExactMatch() {
            return !isFetchFailed() && !isProcessingFailed()
                    && predictedIds().equals(new LinkedHashSet<>(goldenCase.expectedIds()));
        }

        boolean hasProblem() {
            return !goldenCase.isVerified() || isFetchFailed() || isProcessingFailed()
                    || !wrongIds().isEmpty() || !missedIds().isEmpty();
        }

        Set<String> predictedIds() {
            Set<String> ids = new LinkedHashSet<>();
            predicted.forEach(place -> ids.add(goldenCase.canonicalIdOf(place.id())));
            return ids;
        }

        Set<String> hitIds() {
            Set<String> ids = new LinkedHashSet<>(goldenCase.expectedIds());
            ids.retainAll(predictedIds());
            return ids;
        }

        Set<String> wrongIds() {
            Set<String> ids = predictedIds();
            goldenCase.expectedIds().forEach(ids::remove);
            return ids;
        }

        Set<String> missedIds() {
            Set<String> ids = new LinkedHashSet<>(goldenCase.expectedIds());
            ids.removeAll(predictedIds());
            return ids;
        }

        Set<String> apiMissingMissedIds() {
            Set<String> ids = missedIds();
            ids.retainAll(goldenCase.apiMissingIds());
            return ids;
        }

        String wrongNames() {
            return predicted.stream()
                    .filter(place -> wrongIds().contains(goldenCase.canonicalIdOf(place.id())))
                    .map(place -> place.name() + "(" + place.address() + ")")
                    .reduce((a, b) -> a + ", " + b)
                    .orElse("");
        }

        String missedNames() {
            return missedIds().stream()
                    .map(id -> goldenCase.nameOf(id) + (goldenCase.apiMissingIds().contains(id) ? "(카카오 검색 API 미확인)" : ""))
                    .reduce((a, b) -> a + ", " + b)
                    .orElse("");
        }

        /** summary.md에 남기는 한 줄. 결과만 적는다. */
        String summaryLine() {
            List<String> parts = new ArrayList<>();
            parts.add("검증 " + goldenCase.verificationStatus());
            if (!goldenCase.expectedIds().isEmpty()) {
                parts.add("정답 " + goldenCase.expectedIds().size() + "곳 가운데 " + hitIds().size() + "곳 맞힘");
            }
            if (!wrongIds().isEmpty()) {
                String label = "정답 목록 밖 예측(판정 보류) ";
                if (goldenCase.isVerified()) {
                    label = "틀리게 뽑음 ";
                }
                parts.add(label + wrongNames());
            }
            if (!missedIds().isEmpty()) {
                String label = "기록된 지도 ID 중 미일치 ";
                if (goldenCase.isVerified()) {
                    label = "못 맞힘 ";
                }
                parts.add(label + missedNames());
            }
            if (isProcessingFailed() || isFetchFailed()) {
                parts.add(stage.replace('\n', ' '));
            }
            return "- " + goldenCase.caseId() + " " + KIND_LABELS.get(goldenCase.kind()) + ": " + String.join(" / ", parts);
        }

        /** 콘솔에 찍는 한 줄. 지나온 경로와 Gemini 단서까지 적는다. */
        String line() {
            String hintText = hints.stream()
                    .map(hint -> hint.nameInCaption()
                            + (hint.nameSearchHint() == null ? "" : "→" + hint.nameSearchHint())
                            + hint.locationHints().stream()
                                    .map(location -> " [" + location.type() + " " + location.value() + " " + location.basis() + "]")
                                    .reduce("", String::concat))
                    .reduce((a, b) -> a + "; " + b)
                    .orElse("(없음)");
            return String.format("%s %s %s 정답 %d곳 가운데 %d곳 맞힘 / 틀리게 뽑음 %s / 못 맞힘 %s / %s / 경로 %s %.0f초 / 단서 %s",
                    goldenCase.caseId(), KIND_LABELS.get(goldenCase.kind()), goldenCase.url(),
                    goldenCase.expectedIds().size(), hitIds().size(), wrongNames().isEmpty() ? "(없음)" : wrongNames(),
                    missedNames().isEmpty() ? "(없음)" : missedNames(), stage, path, seconds, hintText);
        }
    }
}
