package com.yeogidam.media.extraction.eval;

import static org.assertj.core.api.Assertions.assertThat;

import com.yeogidam.media.extraction.eval.OverseasGoldenSetEvalTest.CaseResult;
import com.yeogidam.media.extraction.eval.OverseasGoldenSetEvalTest.FoundPlace;
import com.yeogidam.media.extraction.eval.OverseasGoldenSetEvalTest.OverseasCase;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class OverseasGoldenSetScoringTest {

    @Test
    void 해외_골든셋_파일의_모든_줄을_같은_칸_수로_읽는다() throws IOException {
        // given
        List<String> lines = Files.readAllLines(Path.of("eval/golden/overseas-cases.csv"));
        int columns = OverseasGoldenSetEvalTest.parseCsvLine(lines.getFirst()).size();

        // when & then
        assertThat(lines.subList(1, lines.size()))
                .hasSize(24)
                .allSatisfy(line -> assertThat(OverseasGoldenSetEvalTest.parseCsvLine(line)).hasSize(columns));
    }

    @Test
    void 따옴표_안의_쉼표는_칸을_나누지_않는다() {
        // when
        List<String> values = OverseasGoldenSetEvalTest.parseCsvLine("O1,\"a, b\",c");

        // then
        assertThat(values).containsExactly("O1", "a, b", "c");
    }

    @Test
    void 이름_낱말과_도시가_맞는_구글_장소만_정답으로_센다() {
        // given
        OverseasCase overseasCase = overseasCase("하르모|ハルモ", "후쿠오카|福岡|Fukuoka");
        FoundPlace rightCity = new FoundPlace("google:1", "Cafe&Dining ハルモ 天神今泉公園前店", "일본 福岡市中央区今泉 1-7-21", "JP");
        FoundPlace otherCity = new FoundPlace("google:2", "ハルモ", "일본 東京都渋谷区", "JP");

        // when
        CaseResult hit = new CaseResult(overseasCase, List.of(), List.of(rightCity), "캡션", "");
        CaseResult miss = new CaseResult(overseasCase, List.of(), List.of(otherCity), "캡션", "");

        // then
        assertThat(hit.hitCount()).isEqualTo(1);
        assertThat(miss.hitCount()).isZero();
    }

    @Test
    void 해외_게시물에_붙은_카카오_장소는_국내_오매칭으로_센다() {
        // given
        OverseasCase overseasCase = overseasCase("잇신도", "오사카|大阪|Osaka");
        FoundPlace kakao = new FoundPlace("1463030296", "잇신카레&라멘 송도타임스페이스점", "인천 연수구 송도동 8-20", null);

        // when
        CaseResult result = new CaseResult(overseasCase, List.of(), List.of(kakao), "캡션", "");

        // then
        assertThat(result.domesticPlaceCount()).isEqualTo(1);
        assertThat(result.hitCount()).isZero();
    }

    @Test
    void 사람이_확인한_정답_ID와_오답_ID로_채점한다() {
        // given
        OverseasCase overseasCase = OverseasCase.from(Map.ofEntries(
                Map.entry("case_id", "O98"), Map.entry("shortcode", "test"), Map.entry("url", "https://www.instagram.com/p/test/"),
                Map.entry("kind", "multi"), Map.entry("group", "overseas"), Map.entry("country", "CN"),
                Map.entry("city_aliases", ""), Map.entry("expected_places", ""),
                Map.entry("verified_google_place_ids", "museum;bbq"), Map.entry("rejected_google_place_ids", "mall"),
                Map.entry("verification_status", "CAPTION_LABELED"), Map.entry("notes", "")));
        List<FoundPlace> places = List.of(
                new FoundPlace("google:museum", "Tsingtao Brewery Museum", "Qingdao", "CN"),
                new FoundPlace("google:mall", "万象城", "Qingdao", "CN"));

        // when
        CaseResult result = new CaseResult(overseasCase, List.of(), places, "캡션", "");

        // then
        assertThat(result.verifiedHitCount()).isEqualTo(1);
        assertThat(result.rejectedCount()).isEqualTo(1);
    }

    private OverseasCase overseasCase(String expectedAliases, String cityAliases) {
        return OverseasCase.from(Map.ofEntries(
                Map.entry("case_id", "O99"),
                Map.entry("shortcode", "test"),
                Map.entry("url", "https://www.instagram.com/p/test/"),
                Map.entry("kind", "caption"),
                Map.entry("group", "overseas"),
                Map.entry("country", "JP"),
                Map.entry("city_aliases", cityAliases),
                Map.entry("expected_places", expectedAliases),
                Map.entry("verified_google_place_ids", ""),
                Map.entry("rejected_google_place_ids", ""),
                Map.entry("verification_status", "CAPTION_LABELED"),
                Map.entry("notes", "")));
    }
}
