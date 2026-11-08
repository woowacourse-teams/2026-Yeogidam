package com.yeogidam.place.repository;

import java.time.DayOfWeek;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

public record PlaceInfoProjection(
        List<OpeningDay> openingHours,
        List<Menu> menus
) {

    public record OpeningDay(
            DayOfWeek dayOfWeek,
            List<OpeningPeriod> periods
    ) {

        public OpeningDay {
            Objects.requireNonNull(dayOfWeek, "요일이 필요합니다.");
            periods = List.copyOf(periods);
        }

        /**
         * 요일별 영업시간을 월요일부터 일요일 순으로 정렬한다.
         * 같은 요일이 두 번 있으면 어느 쪽이 맞는지 알 수 없어서 형식 오류로 본다.
         */
        public static List<OpeningDay> inWeekOrder(List<OpeningDay> days) {
            long distinctDayCount = days.stream()
                    .map(OpeningDay::dayOfWeek)
                    .distinct()
                    .count();
            if (distinctDayCount != days.size()) {
                throw new IllegalArgumentException("같은 요일의 영업시간이 두 번 있습니다.");
            }
            return days.stream()
                    .sorted(Comparator.comparing(OpeningDay::dayOfWeek))
                    .toList();
        }
    }

    /**
     * 영업 구간으로, closesAt이 opensAt보다 이르면 다음 날 closesAt에 닫는다(월요일 18:00~02:00은 화요일 02:00에 닫는 월요일 영업).
     * closesAt에만 24:00을 쓸 수 있고, 24시간 영업은 00:00~24:00으로 적는다.
     */
    public record OpeningPeriod(
            String opensAt,
            String closesAt
    ) {

        private static final Pattern TIME_FORMAT = Pattern.compile("(?:[01][0-9]|2[0-3]):[0-5][0-9]");
        private static final String END_OF_DAY = "24:00";

        public OpeningPeriod {
            if (!isValidTime(opensAt) || !isValidClosingTime(closesAt)) {
                throw new IllegalArgumentException("영업 구간의 시각은 HH:mm 형식이어야 합니다.");
            }
            if (opensAt.equals(closesAt)) {
                throw new IllegalArgumentException("영업 시작 시각과 종료 시각이 같습니다.");
            }
        }

        private static boolean isValidTime(String time) {
            return time != null && TIME_FORMAT.matcher(time).matches();
        }

        private static boolean isValidClosingTime(String time) {
            return END_OF_DAY.equals(time) || isValidTime(time);
        }
    }

    public record Menu(
            String name,
            Integer price
    ) {

        public Menu {
            if (name == null || name.isBlank()) {
                throw new IllegalArgumentException("메뉴 이름이 필요합니다.");
            }
            if (price != null && price < 0) {
                throw new IllegalArgumentException("메뉴 가격은 0원 이상이어야 합니다.");
            }
        }
    }
}
