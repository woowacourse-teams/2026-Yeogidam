package com.yeogidam.place.repository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.yeogidam.place.repository.PlaceInfoProjection.Menu;
import com.yeogidam.place.repository.PlaceInfoProjection.OpeningDay;
import com.yeogidam.place.repository.PlaceInfoProjection.OpeningPeriod;
import java.time.DayOfWeek;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * 앱이 영업 상태를 계산할 때 기대는 영업시간 규칙(자정을 넘기는 구간, 24:00, 요일 순서)과
 * 잘못 넣은 메뉴를 걸러 내는 규칙을 DB 없이 확인한다.
 */
class PlaceInfoProjectionTest {

    @ParameterizedTest
    @CsvSource({
            "18:00, 02:00",
            "10:00, 24:00",
            "00:00, 24:00"
    })
    void 자정을_넘기는_구간과_24시_마감을_받는다(String opensAt, String closesAt) {
        assertThatCode(() -> new OpeningPeriod(opensAt, closesAt))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @CsvSource({
            "24:00, 02:00",
            "9:00, 21:00",
            "10:00, 24:30",
            "10:00, 10:00"
    })
    void 시작_시각이_24시이거나_형식이_다르거나_시작과_끝이_같으면_받지_않는다(String opensAt, String closesAt) {
        assertThatThrownBy(() -> new OpeningPeriod(opensAt, closesAt))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 요일별_영업시간은_월요일부터_일요일_순으로_정렬된다() {
        // given
        List<OpeningDay> days = List.of(
                new OpeningDay(DayOfWeek.SUNDAY, List.of()),
                new OpeningDay(DayOfWeek.MONDAY, List.of(new OpeningPeriod("11:00", "21:00"))),
                new OpeningDay(DayOfWeek.WEDNESDAY, List.of())
        );

        // when
        List<OpeningDay> ordered = OpeningDay.inWeekOrder(days);

        // then
        assertThat(ordered).extracting(OpeningDay::dayOfWeek)
                .containsExactly(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.SUNDAY);
    }

    @Test
    void 같은_요일이_두_번_있으면_받지_않는다() {
        // given
        List<OpeningDay> days = List.of(
                new OpeningDay(DayOfWeek.MONDAY, List.of(new OpeningPeriod("11:00", "15:00"))),
                new OpeningDay(DayOfWeek.MONDAY, List.of(new OpeningPeriod("17:00", "21:00")))
        );

        // when & then
        assertThatThrownBy(() -> OpeningDay.inWeekOrder(days))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 가격을_모르는_메뉴는_받는다() {
        assertThatCode(() -> new Menu("오늘의 디저트", null))
                .doesNotThrowAnyException();
    }

    @Test
    void 이름이_빈_메뉴는_받지_않는다() {
        assertThatThrownBy(() -> new Menu(" ", 4500))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 가격이_음수인_메뉴는_받지_않는다() {
        assertThatThrownBy(() -> new Menu("아메리카노", -1))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
