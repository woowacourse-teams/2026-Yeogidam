package com.yeogidam.place.repository;

import java.time.DayOfWeek;
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
    }

    public record OpeningPeriod(
            String opensAt,
            String closesAt
    ) {

        private static final Pattern TIME_FORMAT = Pattern.compile("(?:[01][0-9]|2[0-3]):[0-5][0-9]");

        public OpeningPeriod {
            if (!isValidTime(opensAt) || !isValidTime(closesAt)) {
                throw new IllegalArgumentException("영업 구간의 시각은 HH:mm 형식이어야 합니다.");
            }
        }

        private static boolean isValidTime(String time) {
            return time != null && TIME_FORMAT.matcher(time).matches();
        }
    }

    public record Menu(
            String name,
            Integer price
    ) {

        public Menu {
            Objects.requireNonNull(name, "메뉴 이름이 필요합니다.");
        }
    }
}
