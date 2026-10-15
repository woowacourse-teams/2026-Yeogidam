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
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
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
 * 골든셋(eval/golden/cases.csv) 40건을 운영 빈 그대로 돌려 eval/results/summary.md를 쓴다.
 * 인스타그램 페이지 읽기, 원본 입수, Gemini 추출, 카카오 검색을 운영과 같은 클래스와 설정으로 부르고,
 * MediaExtractionPipeline과 같은 순서(캡션 → 단서 0건이거나 카카오 0건이면 캡션과 영상, 사진)로 고른다. DB와 S3가 없는 것만 운영과 다르다.
 * 개선 전 열은 고정해 둔 eval/results/before.json의 예측을 지금 정답으로 다시 센다.
 * 외부 API를 부르므로 기본 test에서는 빼고 `./gradlew evalTest --no-daemon`으로만 돌린다. 이력은 git이 든다.
 */
@Tag("eval")
class GoldenSetEvalTest {

    private static final Path EVAL_ROOT = Path.of("eval");
    private static final Path CASES_FILE = EVAL_ROOT.resolve("golden/cases.csv");
    private static final Path RESULTS_DIR = EVAL_ROOT.resolve("results");
    private static final Path SUMMARY_FILE = RESULTS_DIR.resolve("summary.md");
    private static final Path BEFORE_FILE = RESULTS_DIR.resolve("before.json");
    private static final Path ENV_FILE = Path.of(".env");
    private static final long PAUSE_BETWEEN_CASES_MILLIS = 1_000;
    private static final Map<String, String> KIND_LABELS = Map.of(
            "video", "영상 전용 릴스",
            "caption", "캡션에 장소가 있는 릴스",
            "image", "사진 게시물",
            "multi", "모음 게시물 (장소 3곳 이상)",
            "none", "저장할 장소가 없는 게시물");
    private static final List<String> KIND_ORDER = List.of("video", "caption", "image", "multi", "none");
    private static final String MEDIA_ANALYSIS_AUTHOR = "with_sol_mate";

    @Test
    void 골든셋을_운영_빈으로_돌려_채점표를_쓴다() throws IOException {
        Map<String, String> env = readEnv();
        assumeTrue(env.containsKey("GEMINI_API_KEY") && env.containsKey("KAKAO_CLIENT_ID"),
                ".env에 GEMINI_API_KEY와 KAKAO_CLIENT_ID가 있어야 돌릴 수 있습니다");

        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(
                new InstagramConfig().instagramRestClient(RestClient.builder()));
        ExtractionConfig extractionConfig = new ExtractionConfig();
        JsonMapper jsonMapper = JsonMapper.builder().build();
        List<String> fallbackApiKeys = splitKeys(env.getOrDefault("GEMINI_API_KEY_FALLBACKS", ""));
        RestClient instagramMediaRestClient = extractionConfig.instagramMediaRestClient(RestClient.builder());
        RestClient geminiMediaRestClient = extractionConfig.geminiMediaRestClient(RestClient.builder());
        GeminiPlaceNameExtractor extractor = new GeminiPlaceNameExtractor(
                extractionConfig.geminiRestClient(RestClient.builder()),
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
        List<CaseResult> results = new ArrayList<>();
        for (GoldenCase goldenCase : cases) {
            long started = System.currentTimeMillis();
            CaseResult result = run(goldenCase, reader, extractor, searcher)
                    .withSeconds((System.currentTimeMillis() - started) / 1000.0);
            results.add(result);
            System.out.println(result.line());
            pause();
        }
        if (!only.isBlank()) {
            return;   // 몇 건만 돌린 결과로 전체 채점표를 덮어쓰지 않는다
        }
        Files.createDirectories(RESULTS_DIR);
        Files.writeString(SUMMARY_FILE, render(env.get("GEMINI_MODEL"), readBefore(jsonMapper, cases), results));
        System.out.println("채점표: " + SUMMARY_FILE.toAbsolutePath());
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

    // 개선 전 열. 2026-10-09에 be-dev 운영 그대로 받은 예측을 지금 정답으로 다시 센다.
    private List<CaseResult> readBefore(JsonMapper jsonMapper, List<GoldenCase> cases) throws IOException {
        if (!Files.exists(BEFORE_FILE)) {
            return List.of();
        }
        Map<String, GoldenCase> casesById = new LinkedHashMap<>();
        cases.forEach(goldenCase -> casesById.put(goldenCase.caseId(), goldenCase));
        List<CaseResult> results = new ArrayList<>();
        for (JsonNode row : jsonMapper.readTree(Files.readString(BEFORE_FILE)).path("rows")) {
            GoldenCase goldenCase = casesById.get(row.path("case_id").asString());
            if (goldenCase == null) {
                continue;
            }
            if ("fetch_failed".equals(row.path("verdict").asString())) {
                results.add(CaseResult.of(goldenCase, "수집 실패"));
                continue;
            }
            List<PredictedPlace> predicted = new ArrayList<>();
            for (JsonNode place : row.path("predicted")) {
                predicted.add(new PredictedPlace(place.path("id").asString(), place.path("name").asString(),
                        place.path("address").asString()));
            }
            results.add(new CaseResult(goldenCase, predicted, List.of(), "ok", "캡션", 0));
        }
        return results;
    }

    private String render(String model, List<CaseResult> before, List<CaseResult> pipeline) {
        StringBuilder out = new StringBuilder();
        out.append("# 골든셋 채점 결과\n\n");
        out.append("갱신 ").append(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
                .append(", 모델 ").append(model).append(". 골든셋은 40건, 정답 장소 133곳이고 정답과 정하는 규칙은 ")
                .append("`../golden/verification-20261010.md`에 있다.\n\n");
        out.append("칸은 맞힌 장소 비율(맞힌 장소 / 정답 장소)과 틀리게 뽑은 장소 수다. 틀리게 뽑은 장소는 정답에 없는데 뽑은 곳이라 ")
                .append("자동 저장 구조에서는 그대로 틀린 핀이 된다. 카카오맵 웹에만 있고 REST API가 돌려주지 않는 정답 3곳은 ")
                .append("어느 코드로도 맞힐 수 없어서 윗한계는 130/133이다. 인스타그램에서 캡션을 받지 못한 건은 채점에서 뺀다.\n\n");
        out.append("| 게시물 종류 (건수) | 개선 전 (be-dev, 캡션만) | 지금 코드 (캡션, 못 찾으면 영상과 사진) |\n");
        out.append("|---|---|---|\n");
        for (String kind : KIND_ORDER) {
            long count = pipeline.stream().filter(result -> result.goldenCase().kind().equals(kind)).count();
            out.append("| ").append(KIND_LABELS.get(kind)).append(" (").append(count).append(") | ")
                    .append(cell(ofKind(before, kind))).append(" | ")
                    .append(cell(ofKind(pipeline, kind))).append(" |\n");
        }
        out.append("| 전체 (").append(pipeline.size()).append(") | ").append(cell(before)).append(" | ")
                .append(cell(pipeline)).append(" |\n\n");
        List<CaseResult> mediaCases = pipeline.stream().filter(result -> result.path().contains("첨부")).toList();
        out.append("- 개선 전은 2026-10-09에 be-dev 운영 코드와 같은 프롬프트와 카카오 검색으로 받은 예측을 지금 정답으로 다시 센 것이다.\n");
        out.append(String.format("- 지금 코드는 %d건 가운데 %d건에서 영상과 사진까지 읽었다. 한 건 처리에 평균 %.0f초, 영상과 사진까지 읽은 건은 평균 %.0f초가 걸렸다.%n",
                pipeline.size(), mediaCases.size(), averageSeconds(pipeline), averageSeconds(mediaCases)));
        out.append("- Gemini는 같은 입력에도 실행마다 조금씩 다른 단서를 내서, 맞힌 장소가 실행마다 두세 곳 안팎 달라진다.\n\n");
        out.append("## 지금 코드에서 못 맞히거나 틀리게 뽑은 건\n\n");
        pipeline.stream()
                .filter(CaseResult::hasProblem)
                .forEach(result -> out.append(result.summaryLine()).append("\n"));
        return out.toString();
    }

    private List<CaseResult> ofKind(List<CaseResult> results, String kind) {
        return results.stream()
                .filter(result -> result.goldenCase().kind().equals(kind))
                .toList();
    }

    private String cell(List<CaseResult> rows) {
        if (rows.isEmpty()) {
            return "기록 없음";
        }
        List<CaseResult> scored = rows.stream().filter(r -> !r.isFetchFailed()).toList();
        int expected = scored.stream().mapToInt(r -> r.goldenCase().expectedIds().size()).sum();
        int hit = scored.stream().mapToInt(r -> r.hitIds().size()).sum();
        int wrong = scored.stream().mapToInt(r -> r.wrongIds().size()).sum();
        int apiMissing = scored.stream().mapToInt(r -> r.apiMissingMissedIds().size()).sum();
        String text = "정답 없음";
        if (expected > 0) {
            text = Math.round(100.0 * hit / expected) + "% (" + hit + "/" + expected + ")";
        }
        text += ", 틀리게 뽑음 " + wrong;
        if (apiMissing > 0) {
            text += ", 카카오 API 미제공 " + apiMissing;
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

    private List<GoldenCase> readCases() throws IOException {
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
                    splitIds(columns.get("kakao_api_missing_ids"))));
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

    private record GoldenCase(
            String caseId,
            String url,
            String kind,
            List<String> expectedIds,
            List<String> expectedNames,
            List<String> apiMissingIds
    ) {

        String nameOf(String id) {
            int index = expectedIds.indexOf(id);
            if (index < 0 || index >= expectedNames.size()) {
                return id;
            }
            return expectedNames.get(index);
        }
    }

    private record PredictedPlace(
            String id,
            String name,
            String address
    ) {

        static PredictedPlace from(Place place) {
            return new PredictedPlace(place.externalSource().placeId(), place.profile().name().value(),
                    place.profile().address().landLotAddress());
        }
    }

    private record CaseResult(
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

        boolean hasProblem() {
            return !wrongIds().isEmpty() || !missedIds().isEmpty() || stage.startsWith("처리 실패");
        }

        Set<String> predictedIds() {
            Set<String> ids = new LinkedHashSet<>();
            predicted.forEach(place -> ids.add(place.id()));
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
                    .filter(place -> wrongIds().contains(place.id()))
                    .map(place -> place.name() + "(" + place.address() + ")")
                    .reduce((a, b) -> a + ", " + b)
                    .orElse("");
        }

        String missedNames() {
            return missedIds().stream()
                    .map(id -> goldenCase.nameOf(id) + (goldenCase.apiMissingIds().contains(id) ? "(카카오 API 미제공)" : ""))
                    .reduce((a, b) -> a + ", " + b)
                    .orElse("");
        }

        /** summary.md에 남기는 한 줄. 결과만 적는다. */
        String summaryLine() {
            List<String> parts = new ArrayList<>();
            if (!goldenCase.expectedIds().isEmpty()) {
                parts.add("정답 " + goldenCase.expectedIds().size() + "곳 가운데 " + hitIds().size() + "곳 맞힘");
            }
            if (!wrongIds().isEmpty()) {
                parts.add("틀리게 뽑음 " + wrongNames());
            }
            if (!missedIds().isEmpty()) {
                parts.add("못 맞힘 " + missedNames());
            }
            if (stage.startsWith("처리 실패")) {
                parts.add("처리 실패");
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
