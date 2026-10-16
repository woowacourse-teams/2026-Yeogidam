package com.yeogidam.media.extraction.eval;

import com.yeogidam.media.extraction.eval.GoldenSetEvalTest.CaseResult;
import com.yeogidam.media.extraction.eval.GoldenSetEvalTest.GoldenCase;
import com.yeogidam.media.extraction.eval.GoldenSetEvalTest.PredictedPlace;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class GoldenSetEvaluationTest {

    private final GoldenSetEvalTest evaluation = new GoldenSetEvalTest();

    @TempDir
    Path temporaryDirectory;

    @Test
    void 원본의_전체_소개_목록에_음식점_외_장소와_지도에서_못_찾은_장소도_보존한다() throws IOException {
        // given
        List<GoldenCase> cases = evaluation.readCases();

        // when
        GoldenCase travel = find(cases, "C024");
        GoldenCase cafes = find(cases, "C030");
        GoldenCase ikea = find(cases, "C035");
        GoldenCase exhibition = find(cases, "C037");

        // then
        Assertions.assertThat(cases).hasSize(40);
        Assertions.assertThat(travel.observedNames())
                .hasSize(56)
                .contains("디올 성수", "대전시립미술관", "꿈돌이하우스", "영상테마파크");
        Assertions.assertThat(cafes.observedNames())
                .hasSize(64)
                .contains("치읓의자리", "데이오브벌스", "카페드토스트", "소쿱", "플로븐베이커리", "올라이스");
        Assertions.assertThat(cafes.expectedIds()).contains("392724854");
        Assertions.assertThat(ikea.expectedIds()).containsExactly("2032736351");
        Assertions.assertThat(exhibition.expectedIds()).containsExactly("16440291");
    }

    @Test
    void 원본을_열지_못했거나_지도_위치가_미확정인_사례를_검증_완료로_표시하지_않는다() throws IOException {
        // when
        List<GoldenCase> cases = evaluation.readCases();

        // then
        Assertions.assertThat(find(cases, "C015").verificationStatus()).isEqualTo("SOURCE_UNAVAILABLE");
        Assertions.assertThat(find(cases, "C021").verificationStatus()).isEqualTo("SOURCE_UNAVAILABLE");
        Assertions.assertThat(find(cases, "C024").isVerified()).isFalse();
        Assertions.assertThat(find(cases, "C030").isVerified()).isFalse();
        Assertions.assertThat(find(cases, "C035").isVerified()).isTrue();
    }

    @Test
    void 지도_정답이_없는_사례도_처리_실패와_정상_빈_결과를_구분한다() {
        // given
        GoldenCase golden = golden("VERIFIED", List.of(), Map.of());
        CaseResult empty = CaseResult.of(golden, List.of(), List.of(), "첨부");
        CaseResult failed = CaseResult.failed(golden, List.of(), "HTTP 503", "첨부");

        // when
        String cell = evaluation.cell(List.of(empty, failed));

        // then
        Assertions.assertThat(empty.isExactMatch()).isTrue();
        Assertions.assertThat(failed.isExactMatch()).isFalse();
        Assertions.assertThat(cell)
                .contains("완전 일치 1/2", "처리 실패 1");
    }

    @Test
    void 미검증_정답의_예측을_오탐이나_정답_분모에_섞지_않는다() {
        // given
        GoldenCase verified = golden("VERIFIED", List.of("1"), Map.of());
        GoldenCase partial = golden("PARTIAL", List.of("2"), Map.of());
        CaseResult hit = new CaseResult(verified, List.of(new PredictedPlace("1", "장소", "주소")),
                List.of(), "ok", "캡션", 1);
        CaseResult provisional = new CaseResult(partial, List.of(new PredictedPlace("unknown", "후보", "주소")),
                List.of(), "ok", "첨부", 2);

        // when
        String cell = evaluation.cell(List.of(hit, provisional));

        // then
        Assertions.assertThat(cell)
                .contains("100% (1/1)", "틀리게 뽑음 0", "미검증 1");
        Assertions.assertThat(provisional.hasProblem()).isTrue();
        Assertions.assertThat(provisional.summaryLine())
                .contains("정답 목록 밖 예측(판정 보류)")
                .doesNotContain("틀리게 뽑음");
    }

    @Test
    void 같은_장소임을_검증한_지도_ID_별칭은_한_곳으로_채점한다() {
        // given
        GoldenCase golden = golden("VERIFIED", List.of("1"), Map.of("old-id", "1"));
        CaseResult result = new CaseResult(golden,
                List.of(new PredictedPlace("1", "LDB", "주소"), new PredictedPlace("old-id", "원문 영문명", "주소")),
                List.of(), "ok", "첨부", 1);

        // when & then
        Assertions.assertThat(result.hitIds()).containsExactly("1");
        Assertions.assertThat(result.wrongIds()).isEmpty();
        Assertions.assertThat(result.isExactMatch()).isTrue();
    }

    @Test
    void 채점표의_게시물과_정답_개수는_실행한_데이터에서_계산한다() {
        // given
        GoldenCase golden = golden("VERIFIED", List.of("1"), Map.of());
        CaseResult result = new CaseResult(golden, List.of(new PredictedPlace("1", "장소", "주소")),
                List.of(), "ok", "캡션", 1);

        // when
        String report = evaluation.render("test-model", List.of(result));

        // then
        Assertions.assertThat(report)
                .contains("실행 1건", "지도 정답 1곳", "검증 완료 1건")
                .doesNotContain("133", "130/133", "과거 음식점", "before.json");
    }

    @Test
    void 부분_진행_결과에도_전체_예측_ID와_실패_상태와_골든셋_해시를_저장한다() throws IOException {
        // given
        JsonMapper mapper = JsonMapper.builder().build();
        GoldenCase golden = golden("PARTIAL", List.of("1"), Map.of());
        CaseResult result = new CaseResult(golden, List.of(new PredictedPlace("other", "예측", "주소")),
                List.of(), "ok", "첨부", 3);
        Path file = temporaryDirectory.resolve("both-partial.json");

        // when
        evaluation.writeResults(mapper, file, "test-model", List.of(golden), List.of(result), false);
        JsonNode saved = mapper.readTree(Files.readString(file));

        // then
        Assertions.assertThat(saved.path("complete").asBoolean()).isFalse();
        Assertions.assertThat(saved.path("goldenSha256").asString()).hasSize(64);
        Assertions.assertThat(saved.path("rows").path(0).path("predicted").path(0).path("id").asString())
                .isEqualTo("other");
        Assertions.assertThat(saved.path("rows").path(0).path("goldenCase").path("verificationStatus").asString())
                .isEqualTo("PARTIAL");
    }

    @Test
    void 저장된_예측은_그대로_두고_현재_정답으로_다시_채점한다() {
        // given
        JsonMapper mapper = JsonMapper.builder().build();
        GoldenCase current = golden("VERIFIED", List.of("new-id"), Map.of());
        JsonNode saved = mapper.readTree("""
                {"rows":[{"goldenCase":{"caseId":"fixture","url":"https://example.com",
                  "expectedIds":["old-id"]},
                  "predicted":[{"id":"new-id","name":"장소","address":"주소"}],
                  "stage":"ok","path":"첨부","seconds":2.5}]}
                """);

        // when
        List<CaseResult> results = evaluation.readSavedResults(saved, List.of(current));

        // then
        Assertions.assertThat(results.getFirst().isExactMatch()).isTrue();
        Assertions.assertThat(results.getFirst().seconds()).isEqualTo(2.5);
        Assertions.assertThat(saved.path("rows").path(0).path("goldenCase").path("expectedIds").path(0).asString())
                .isEqualTo("old-id");
    }

    @Test
    void 재채점에서도_처리_실패를_정상_빈_결과로_바꾸지_않는다() {
        // given
        JsonMapper mapper = JsonMapper.builder().build();
        GoldenCase current = golden("VERIFIED", List.of(), Map.of());
        CaseResult failed = CaseResult.failed(current, List.of(), "HTTP 503", "첨부");
        JsonNode saved = mapper.valueToTree(Map.of("rows", List.of(failed)));

        // when
        CaseResult result = evaluation.readSavedResults(saved, List.of(current)).getFirst();

        // then
        Assertions.assertThat(result.isProcessingFailed()).isTrue();
        Assertions.assertThat(result.isExactMatch()).isFalse();
    }

    @Test
    void 사례_ID가_같아도_원문_URL이_달라지면_재채점_예외가_발생한다() {
        // given
        JsonMapper mapper = JsonMapper.builder().build();
        GoldenCase current = golden("VERIFIED", List.of("1"), Map.of());
        JsonNode saved = mapper.readTree("""
                {"rows":[{"goldenCase":{"caseId":"fixture","url":"https://example.com/changed"},
                  "predicted":[],"stage":"ok","path":"캡션","seconds":1}]}
                """);

        // when & then
        Assertions.assertThatThrownBy(() -> evaluation.readSavedResults(saved, List.of(current)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("URL");
    }

    @Test
    void 미완료_실행_파일로_전체_채점표를_갱신하면_예외가_발생한다() throws IOException {
        // given
        Path file = temporaryDirectory.resolve("incomplete.json");
        Files.writeString(file, """
                {"schemaVersion":1,"runner":"java-operational","inputStrategy":"caption_then_media",
                  "complete":false,"rows":[]}
                """);

        // when & then
        Assertions.assertThatThrownBy(() -> evaluation.rescoreSavedResults(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("전체 사례의 완료 결과");
    }

    @Test
    void 과거_Python_실험_결과를_Java_운영_평가로_재채점하면_예외가_발생한다() throws IOException {
        // given
        Path file = temporaryDirectory.resolve("both.json");
        Files.writeString(file, """
                {"variant":"both","rows":[]}
                """);

        // when & then
        Assertions.assertThatThrownBy(() -> evaluation.rescoreSavedResults(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Java 운영 흐름");
    }

    @Test
    void 정답_ID와_이름의_개수가_다르면_예외가_발생한다() {
        // when & then
        Assertions.assertThatThrownBy(() -> new GoldenCase("C001", "https://example.com", "caption",
                        List.of("1"), List.of(), List.of(), "VERIFIED", List.of("장소"), Map.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private GoldenCase find(List<GoldenCase> cases, String caseId) {
        return cases.stream()
                .filter(golden -> golden.caseId().equals(caseId))
                .findFirst()
                .orElseThrow();
    }

    private GoldenCase golden(String verification, List<String> ids, Map<String, String> aliases) {
        return new GoldenCase("fixture", "https://example.com", "caption", ids,
                ids.stream().map(id -> "장소" + id).toList(), List.of(), verification,
                ids.stream().map(id -> "장소" + id).toList(), aliases);
    }
}
