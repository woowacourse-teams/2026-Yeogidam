package com.yeogidam.media.extraction.eval;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.yeogidam.media.extraction.config.ExtractionConfig;
import com.yeogidam.media.extraction.config.GeminiProperties;
import com.yeogidam.media.extraction.config.GooglePlacesProperties;
import com.yeogidam.media.extraction.config.KakaoLocalProperties;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.infrastructure.GeminiFileClient;
import com.yeogidam.media.extraction.infrastructure.GeminiPlaceSearchHintExtractor;
import com.yeogidam.media.extraction.infrastructure.GoogleOverseasPlaceSearcher;
import com.yeogidam.media.extraction.infrastructure.GooglePlacesClient;
import com.yeogidam.media.extraction.infrastructure.KakaoDomesticPlaceSearcher;
import com.yeogidam.media.extraction.service.PlaceSearchRouter;
import com.yeogidam.media.instagram.config.InstagramConfig;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.domain.MediaMetadataWithUrl;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaDownloader;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaHtmlReader;
import com.yeogidam.media.instagram.infrastructure.InstagramMediaSourceReader;
import com.yeogidam.place.domain.MapProvider;
import com.yeogidam.place.domain.Place;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.Normalizer;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 해외 골든셋(eval/golden/overseas-cases.csv)을 운영과 같은 클래스로 돌려 eval/results/overseas-summary.md를 쓴다.
 * 운영 해외 게시물 21개와 해외 낱말이 들어간 국내 대조군 3개로, 나라 판단, 국내 가게가 잘못 붙는 일, 해외 장소 적중을 본다.
 * Google 키(GOOGLE_PLACES_API_KEY)가 없으면 해외 단서는 찾지 못한 것으로 끝나므로, 나라 판단과 국내 오매칭만 볼 수 있다.
 * 사람이 지도와 원본으로 확인한 Google 장소 ID(verified_google_place_ids)와 오답 ID(rejected_google_place_ids)로 채점하고,
 * 아직 확정하지 않은 정답은 이름 낱말과 도시로 느슨하게 맞춘다. 사람이 볼 수 있게 찾은 장소를 모두 적는다.
 * 외부 API를 부르므로 `./gradlew evalTest --no-daemon --tests '*OverseasGoldenSetEvalTest'`로만 돌린다.
 */
@Tag("eval")
class OverseasGoldenSetEvalTest {

    private static final Path EVAL_ROOT = Path.of("eval");
    private static final Path CASES_FILE = EVAL_ROOT.resolve("golden/overseas-cases.csv");
    private static final Path RESULTS_DIR = EVAL_ROOT.resolve("results");
    private static final Path SUMMARY_FILE = RESULTS_DIR.resolve("overseas-summary.md");
    private static final Path RAW_FILE = RESULTS_DIR.resolve("overseas.json");
    private static final long PAUSE_BETWEEN_CASES_MILLIS = 1_000;
    private static final String MEDIA_ANALYSIS_AUTHOR = "with_sol_mate";
    private static final String KOREA = "KR";

    @Test
    void 해외_골든셋을_운영_빈으로_돌려_채점표를_쓴다() throws IOException {
        // 저장된 결과를 지금 정답으로 다시 채점할 때는 외부 API를 부르지 않는다
        String savedResults = System.getProperty("eval.results-file", "");
        if (!savedResults.isBlank()) {
            rescoreSavedResults(Path.of(savedResults));
            return;
        }
        // 쉼표로 여러 파일을 주면 차례로 읽고 뒤 파일 값이 앞 값을 덮는다(본 저장소 .env 뒤에 워크트리 .env)
        Map<String, String> env = readEnv(System.getProperty("eval.env-file", ".env"));
        assumeTrue(env.containsKey("GEMINI_API_KEY") && env.containsKey("KAKAO_CLIENT_ID"),
                ".env에 GEMINI_API_KEY와 KAKAO_CLIENT_ID가 있어야 돌릴 수 있습니다");

        InstagramMediaHtmlReader reader = new InstagramMediaHtmlReader(
                new InstagramConfig().instagramRestClient(RestClient.builder()));
        ExtractionConfig config = new ExtractionConfig();
        JsonMapper jsonMapper = JsonMapper.builder().build();
        GeminiEvalRequestLimiter requestLimiter = new GeminiEvalRequestLimiter();
        RestClient instagramMediaRestClient = config.instagramMediaRestClient(
                RestClient.builder(), config.instagramMediaHttpClient());
        RestClient geminiMediaRestClient = config.geminiMediaRestClient(
                RestClient.builder().requestInterceptor(requestLimiter), config.geminiMediaHttpClient());
        GeminiPlaceSearchHintExtractor extractor = new GeminiPlaceSearchHintExtractor(
                config.geminiRestClient(RestClient.builder().requestInterceptor(requestLimiter)),
                new GeminiProperties(env.get("GEMINI_API_KEY"), env.get("GEMINI_MODEL"),
                        splitKeys(env.getOrDefault("GEMINI_API_KEY_FALLBACKS", ""))),
                jsonMapper,
                Clock.systemUTC(),
                geminiMediaRestClient,
                new InstagramMediaDownloader(new InstagramMediaSourceReader(instagramMediaRestClient, jsonMapper),
                        instagramMediaRestClient),
                new GeminiFileClient(geminiMediaRestClient));
        GooglePlacesProperties googleProperties = new GooglePlacesProperties(env.get("GOOGLE_PLACES_API_KEY"));
        PlaceSearchRouter router = new PlaceSearchRouter(
                new KakaoDomesticPlaceSearcher(config.kakaoLocalRestClient(RestClient.builder()),
                        new KakaoLocalProperties(env.get("KAKAO_CLIENT_ID"))),
                new GoogleOverseasPlaceSearcher(new GooglePlacesClient(config.googlePlacesRestClient(RestClient.builder()), googleProperties)));
        System.out.println("Google Places 키: " + (googleProperties.enabled() ? "있음" : "없음(해외 단서는 찾지 못한 것으로 끝남)"));

        List<OverseasCase> cases = readCases();
        String only = System.getProperty("eval.cases", "");
        if (!only.isBlank()) {
            List<String> ids = List.of(only.split(","));
            cases = cases.stream().filter(overseasCase -> ids.contains(overseasCase.caseId())).toList();
        }
        List<CaseResult> results = new ArrayList<>();
        for (OverseasCase overseasCase : cases) {
            CaseResult result = run(overseasCase, reader, extractor, router);
            results.add(result);
            System.out.println(result.line());
            pause();
        }
        // 몇 건만 돌린 결과로 전체 채점표를 덮어쓰지 않는다
        Path resultsDir = only.isBlank() ? RESULTS_DIR : Path.of("build/eval");
        Path summaryFile = resultsDir.resolve(SUMMARY_FILE.getFileName());
        Files.createDirectories(resultsDir);
        Files.writeString(resultsDir.resolve(RAW_FILE.getFileName()),
                jsonMapper.writerWithDefaultPrettyPrinter().writeValueAsString(results));
        Files.writeString(summaryFile, render(env.get("GEMINI_MODEL"), googleProperties.enabled(), results));
        System.out.println("채점표: " + summaryFile.toAbsolutePath());
    }

    private void rescoreSavedResults(Path savedResults) throws IOException {
        JsonMapper jsonMapper = JsonMapper.builder().build();
        Map<String, OverseasCase> cases = new LinkedHashMap<>();
        readCases().forEach(overseasCase -> cases.put(overseasCase.caseId(), overseasCase));
        JsonNode saved = jsonMapper.readTree(Files.readString(savedResults));
        // evalTest는 국내 골든셋을 다시 채점할 때도 이 테스트를 함께 돌리므로, 해외 결과 파일이 아니면 해외 채점표를 덮지 않고 건너뛴다.
        assumeTrue(saved.isArray() && !saved.isEmpty() && saved.get(0).has("overseasCase"),
                "해외 골든셋 결과 파일이 아니라서 해외 채점표를 다시 쓰지 않습니다.");
        List<CaseResult> results = new ArrayList<>();
        for (JsonNode row : saved) {
            OverseasCase overseasCase = cases.get(row.path("overseasCase").path("caseId").asString());
            if (overseasCase == null) {
                continue;
            }
            List<HintView> hints = new ArrayList<>();
            for (JsonNode hint : row.path("hints")) {
                hints.add(new HintView(hint.path("name").asString(), textOrNull(hint.path("searchName")),
                        textOrNull(hint.path("countryCode"))));
            }
            List<FoundPlace> places = new ArrayList<>();
            for (JsonNode place : row.path("places")) {
                places.add(new FoundPlace(place.path("id").asString(), place.path("name").asString(),
                        place.path("address").asString(), textOrNull(place.path("hintCountry"))));
            }
            results.add(new CaseResult(overseasCase, hints, places, row.path("path").asString(), row.path("error").asString()));
        }
        Files.createDirectories(RESULTS_DIR);
        Files.writeString(SUMMARY_FILE, render("저장된 결과 " + savedResults.getFileName(), true, results));
        System.out.println("다시 채점한 채점표: " + SUMMARY_FILE.toAbsolutePath());
    }

    private static String textOrNull(JsonNode node) {
        return node.isNull() || node.isMissingNode() ? null : node.asString();
    }

    // MediaExtractionPipeline.findPlacesFromCaptionThenMedia와 같은 순서로 돌린다
    private CaseResult run(
            OverseasCase overseasCase,
            InstagramMediaHtmlReader reader,
            GeminiPlaceSearchHintExtractor extractor,
            PlaceSearchRouter router
    ) {
        InstagramUrl url = new InstagramUrl(overseasCase.url());
        MediaMetadataWithUrl metadata;
        try {
            metadata = reader.read(url);
        } catch (RuntimeException exception) {
            return CaseResult.failed(overseasCase, List.of(), "수집 실패: " + describe(exception), "");
        }
        if (metadata.caption() == null || metadata.caption().isBlank()) {
            return CaseResult.failed(overseasCase, List.of(), "수집 실패: 캡션 없음", "");
        }
        boolean mediaFirst = MEDIA_ANALYSIS_AUTHOR.equals(metadata.author());
        List<PlaceSearchHint> captionHints = List.of();
        if (!mediaFirst) {
            try {
                captionHints = extractor.extract(metadata.caption()).places();
                List<FoundPlace> places = findPlaces(captionHints, router);
                if (!places.isEmpty()) {
                    return CaseResult.of(overseasCase, captionHints, places, "캡션");
                }
            } catch (RuntimeException exception) {
                return CaseResult.failed(overseasCase, captionHints, describe(exception), "캡션");
            }
        }
        String path = captionHints.isEmpty() ? "캡션→첨부" : "캡션→지도0건→첨부";
        try {
            List<PlaceSearchHint> hints = extractor.extractFile(metadata.caption(), url).places();
            List<PlaceSearchHint> allHints = new ArrayList<>(captionHints);
            allHints.addAll(hints);
            return CaseResult.of(overseasCase, allHints, findPlaces(hints, router), path);
        } catch (RuntimeException exception) {
            return CaseResult.failed(overseasCase, captionHints, describe(exception), path);
        }
    }

    private List<FoundPlace> findPlaces(List<PlaceSearchHint> hints, PlaceSearchRouter router) {
        Map<String, FoundPlace> placesById = new LinkedHashMap<>();
        for (PlaceSearchHint hint : hints) {
            for (Place place : router.search(hint)) {
                FoundPlace found = FoundPlace.of(hint, place);
                placesById.putIfAbsent(found.id(), found);
            }
        }
        return List.copyOf(placesById.values());
    }

    String render(String model, boolean googleEnabled, List<CaseResult> results) {
        List<CaseResult> overseas = results.stream().filter(result -> !result.overseasCase().isControl()).toList();
        List<CaseResult> controls = results.stream().filter(result -> result.overseasCase().isControl()).toList();
        List<CaseResult> labeled = overseas.stream().filter(result -> result.overseasCase().isLabeled()).toList();
        int expected = labeled.stream().mapToInt(result -> result.overseasCase().expectedPlaces().size()).sum();
        int hit = labeled.stream().mapToInt(CaseResult::hitCount).sum();
        long hintsOverseas = overseas.stream().flatMap(result -> result.hints().stream()).count();
        long hintsJudgedOverseas = overseas.stream().flatMap(result -> result.hints().stream())
                .filter(hint -> hint.countryCode() != null && !KOREA.equals(hint.countryCode()))
                .count();
        long hintsRightCountry = overseas.stream()
                .filter(result -> !result.overseasCase().country().isBlank())
                .flatMap(result -> result.hints().stream().map(hint -> Objects.equals(hint.countryCode(), result.overseasCase().country())))
                .filter(Boolean::booleanValue)
                .count();
        long hintsWithExpectedCountry = overseas.stream()
                .filter(result -> !result.overseasCase().country().isBlank())
                .mapToLong(result -> result.hints().size())
                .sum();
        int domesticMismatches = overseas.stream().mapToInt(CaseResult::domesticPlaceCount).sum();
        int verifiedExpected = overseas.stream().mapToInt(result -> result.overseasCase().verifiedIds().size()).sum();
        int verifiedHit = overseas.stream().mapToInt(CaseResult::verifiedHitCount).sum();
        int rejectedFound = overseas.stream().mapToInt(CaseResult::rejectedCount).sum();

        StringBuilder out = new StringBuilder();
        out.append("# 해외 골든셋 채점 결과\n\n");
        out.append("갱신 ").append(LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")))
                .append(", 모델 ").append(model).append(", Google Places 키 ").append(googleEnabled ? "있음" : "없음")
                .append(". 운영 해외 게시물 ").append(overseas.size()).append("건과 국내 대조군 ").append(controls.size())
                .append("건을 돌렸다.\n\n");
        out.append("| 지표 | 값 | 목표 |\n|---|---|---|\n");
        out.append("| 해외 게시물 단서 가운데 해외로 판단한 비율 | ").append(hintsJudgedOverseas).append("/").append(hintsOverseas)
                .append(" | 모두 |\n");
        out.append("| 해외 게시물 단서 가운데 나라 코드까지 맞힌 비율 | ").append(hintsRightCountry).append("/")
                .append(hintsWithExpectedCountry).append(" | 모두 |\n");
        out.append("| 해외 게시물에 국내 장소가 붙은 수 | ").append(domesticMismatches).append(" | 0 |\n");
        out.append("| 사람이 확인한 정답 Google ID 가운데 다시 찾은 장소 | ").append(verifiedHit).append("/")
                .append(verifiedExpected).append(" | 높을수록 |\n");
        out.append("| 사람이 오답으로 판정한 Google ID가 다시 붙은 수 | ").append(rejectedFound).append(" | 0 |\n");
        out.append("| 이름을 적은 해외 정답 가운데 찾은 장소(이름 낱말과 도시로 느슨하게 맞춤, 참고) | ").append(hit).append("/")
                .append(expected).append(" | 높을수록 |\n");
        out.append("| 대조군에서 해외로 보낸 단서 수 | ")
                .append(controls.stream().flatMap(result -> result.hints().stream()).filter(hint -> !hint.isDomestic()).count())
                .append(" | 0 |\n\n");
        out.append("해외 정답은 Google 장소 ID를 아직 확정하지 않아서, 아래 표의 찾은 장소를 사람이 보고 맞는지 확인한 뒤 ID를 적는다.\n\n");
        out.append("| 사례 | 상태 | 나라(정답) | 단서의 나라 | 경로 | 찾은 장소 | 정답 적중 | 메모 |\n|---|---|---|---|---|---|---|---|\n");
        results.forEach(result -> out.append(result.row()).append("\n"));
        return out.toString();
    }

    private List<OverseasCase> readCases() throws IOException {
        List<String> lines = Files.readAllLines(CASES_FILE);
        List<String> header = parseCsvLine(lines.getFirst());
        List<OverseasCase> cases = new ArrayList<>();
        for (String line : lines.subList(1, lines.size())) {
            if (line.isBlank()) {
                continue;
            }
            List<String> values = parseCsvLine(line);
            Map<String, String> row = new LinkedHashMap<>();
            for (int i = 0; i < header.size(); i++) {
                row.put(header.get(i), i < values.size() ? values.get(i) : "");
            }
            cases.add(OverseasCase.from(row));
        }
        return cases;
    }

    // 따옴표 안의 쉼표를 살리는 최소한의 CSV 읽기. 골든셋 파일은 Python csv 모듈로 쓴다.
    static List<String> parseCsvLine(String line) {
        List<String> values = new ArrayList<>();
        StringBuilder value = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted && ch == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                value.append('"');
                i++;
            } else if (ch == '"') {
                quoted = !quoted;
            } else if (ch == ',' && !quoted) {
                values.add(value.toString());
                value.setLength(0);
            } else {
                value.append(ch);
            }
        }
        values.add(value.toString());
        return values;
    }

    private Map<String, String> readEnv(String envFiles) throws IOException {
        Map<String, String> env = new LinkedHashMap<>(System.getenv());
        for (String envFile : envFiles.split(",")) {
            Path path = Path.of(envFile.strip());
            if (!Files.exists(path)) {
                continue;
            }
            for (String line : Files.readAllLines(path)) {
                int separator = line.indexOf('=');
                if (line.isBlank() || line.startsWith("#") || separator < 0) {
                    continue;
                }
                String value = line.substring(separator + 1).trim().replaceAll("^\"|\"$", "");
                if (!value.isBlank()) {
                    env.put(line.substring(0, separator).trim(), value);
                }
            }
        }
        return env;
    }

    private List<String> splitKeys(String keys) {
        return Arrays.stream(keys.split(",")).map(String::strip).filter(key -> !key.isBlank()).toList();
    }

    private void pause() {
        try {
            Thread.sleep(PAUSE_BETWEEN_CASES_MILLIS);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
    }

    private static String describe(Throwable exception) {
        StringBuilder text = new StringBuilder(Objects.requireNonNullElse(exception.getMessage(), exception.getClass().getSimpleName()));
        for (Throwable cause = exception.getCause(); cause != null; cause = cause.getCause()) {
            text.append(" <- ").append(Objects.requireNonNullElse(cause.getMessage(), cause.getClass().getSimpleName()));
        }
        return text.toString();
    }

    static String normalize(String value) {
        return Normalizer.normalize(Objects.requireNonNullElse(value, ""), Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT)
                .replaceAll("[\\p{Z}\\p{P}\\p{S}\\s]", "");
    }

    record OverseasCase(
            String caseId,
            String shortcode,
            String url,
            String kind,
            String group,
            String country,
            List<String> cityAliases,
            List<List<String>> expectedPlaces,
            List<String> verifiedIds,
            List<String> rejectedIds,
            String status,
            String notes
    ) {

        static OverseasCase from(Map<String, String> row) {
            return new OverseasCase(row.get("case_id"), row.get("shortcode"), row.get("url"), row.get("kind"),
                    row.get("group"), row.get("country"), split(row.get("city_aliases"), "\\|"),
                    split(row.get("expected_places"), ";").stream().map(place -> split(place, "\\|")).toList(),
                    googleIds(row.get("verified_google_place_ids")), googleIds(row.get("rejected_google_place_ids")),
                    row.get("verification_status"), row.get("notes"));
        }

        // 골든셋에는 Google place_id만 적고, 결과 파일의 장소 ID와 견줄 때 "google:" 접두어를 붙인다.
        private static List<String> googleIds(String value) {
            return split(value, ";").stream().map(id -> "google:" + id).toList();
        }

        private static List<String> split(String value, String separator) {
            if (value == null || value.isBlank()) {
                return List.of();
            }
            return Arrays.stream(value.split(separator)).map(String::strip).filter(part -> !part.isBlank()).toList();
        }

        boolean isControl() {
            return "control".equals(group);
        }

        boolean isLabeled() {
            return !expectedPlaces.isEmpty();
        }
    }

    record FoundPlace(String id, String name, String address, String hintCountry) {

        // 결과 파일에서 카카오 장소와 구글 장소를 가르려고 구글 장소 ID에는 "google:" 접두어를 붙인다.
        static FoundPlace of(PlaceSearchHint hint, Place place) {
            return new FoundPlace(label(place), place.profile().name().value(),
                    place.profile().address().landLotAddress(), hint.countryCode());
        }

        private static String label(Place place) {
            if (place.externalSource().mapProvider() == MapProvider.GOOGLE) {
                return "google:" + place.externalSource().placeId();
            }
            return place.externalSource().placeId();
        }

        boolean isGoogle() {
            return id.startsWith("google:");
        }
    }

    record HintView(String name, String searchName, String countryCode) {

        static HintView of(PlaceSearchHint hint) {
            return new HintView(hint.nameInCaption(), hint.nameSearchHint(), hint.countryCode());
        }

        boolean isDomestic() {
            return countryCode == null || KOREA.equals(countryCode);
        }
    }

    record CaseResult(
            OverseasCase overseasCase,
            List<HintView> hints,
            List<FoundPlace> places,
            String path,
            String error
    ) {

        static CaseResult of(OverseasCase overseasCase, List<PlaceSearchHint> hints, List<FoundPlace> places, String path) {
            return new CaseResult(overseasCase, hints.stream().map(HintView::of).toList(), places, path, "");
        }

        static CaseResult failed(OverseasCase overseasCase, List<PlaceSearchHint> hints, String error, String path) {
            return new CaseResult(overseasCase, hints.stream().map(HintView::of).toList(), List.of(), path, error);
        }

        // 해외 게시물에 붙은 카카오 장소는 모두 국내 가게가 잘못 붙은 것이다.
        int domesticPlaceCount() {
            return (int) places.stream().filter(place -> !place.isGoogle()).count();
        }

        int verifiedHitCount() {
            return (int) overseasCase.verifiedIds().stream().filter(this::hasPlace).count();
        }

        int rejectedCount() {
            return (int) overseasCase.rejectedIds().stream().filter(this::hasPlace).count();
        }

        private boolean hasPlace(String id) {
            return places.stream().anyMatch(place -> place.id().equals(id));
        }

        int hitCount() {
            return (int) overseasCase.expectedPlaces().stream().filter(this::found).count();
        }

        private boolean found(List<String> aliases) {
            return places.stream().anyMatch(place -> matchesName(place, aliases) && matchesCity(place));
        }

        private boolean matchesName(FoundPlace place, List<String> aliases) {
            String name = normalize(place.name());
            return aliases.stream().map(OverseasGoldenSetEvalTest::normalize)
                    .filter(alias -> !alias.isBlank())
                    .anyMatch(alias -> name.contains(alias) || alias.contains(name));
        }

        private boolean matchesCity(FoundPlace place) {
            if (overseasCase.cityAliases().isEmpty()) {
                return true;
            }
            String address = normalize(place.address());
            return overseasCase.cityAliases().stream().map(OverseasGoldenSetEvalTest::normalize)
                    .anyMatch(address::contains);
        }

        String line() {
            return overseasCase.caseId() + " " + path + " 단서 " + hints.size() + "개, 장소 " + places.size() + "곳"
                    + (error.isBlank() ? "" : ", 오류 " + error);
        }

        String row() {
            String hintCountries = hints.stream().map(hint -> Objects.requireNonNullElse(hint.countryCode(), "없음"))
                    .distinct().reduce((left, right) -> left + ", " + right).orElse("단서 없음");
            String found = places.stream().map(place -> (place.isGoogle() ? "G " : "K ") + place.name() + " (" + place.address() + ")")
                    .reduce((left, right) -> left + "<br>" + right).orElse("");
            String hits = overseasCase.verifiedIds().isEmpty()
                    ? (overseasCase.isLabeled() ? "이름 " + hitCount() + "/" + overseasCase.expectedPlaces().size() : "")
                    : "확인 " + verifiedHitCount() + "/" + overseasCase.verifiedIds().size()
                            + (rejectedCount() > 0 ? ", 오답 " + rejectedCount() : "");
            String memo = error.isBlank() ? overseasCase.notes() : "오류: " + error;
            return "| " + overseasCase.caseId() + " | " + overseasCase.status() + " | "
                    + (overseasCase.country().isBlank() ? "-" : overseasCase.country()) + " | " + hintCountries + " | " + path
                    + " | " + found + " | " + hits + " | " + memo.replace("|", "/") + " |";
        }
    }
}
