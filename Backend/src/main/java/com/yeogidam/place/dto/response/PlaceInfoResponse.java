package com.yeogidam.place.dto.response;

import com.yeogidam.place.repository.PlaceInfoProjection;
import com.yeogidam.place.repository.PlaceInfoProjection.Menu;
import com.yeogidam.place.repository.PlaceInfoProjection.OpeningDay;
import com.yeogidam.place.repository.PlaceInfoProjection.OpeningPeriod;
import java.time.DayOfWeek;
import java.util.List;
import java.util.Objects;

public record PlaceInfoResponse(
        List<OpeningDayResponse> openingHours,
        List<MenuResponse> menus
) {
    public static PlaceInfoResponse from(PlaceInfoProjection projection) {
        List<Menu> menus = Objects.requireNonNullElse(projection.menus(), List.of());
        return new PlaceInfoResponse(toOpeningDayResponses(projection.openingHours()), menus.stream()
                .map(MenuResponse::from)
                .toList());
    }

    private static List<OpeningDayResponse> toOpeningDayResponses(List<OpeningDay> openingDays) {
        if (openingDays == null) {
            return null;
        }
        return openingDays.stream()
                .map(OpeningDayResponse::from)
                .toList();
    }

    public record OpeningDayResponse(
            DayOfWeek dayOfWeek,
            List<OpeningPeriodResponse> periods
    ) {
        private static OpeningDayResponse from(OpeningDay day) {
            List<OpeningPeriodResponse> periods = day.periods().stream()
                    .map(OpeningPeriodResponse::from)
                    .toList();
            return new OpeningDayResponse(day.dayOfWeek(), periods);
        }
    }

    public record OpeningPeriodResponse(
            String opensAt,
            String closesAt
    ) {
        private static OpeningPeriodResponse from(OpeningPeriod period) {
            return new OpeningPeriodResponse(period.opensAt(), period.closesAt());
        }
    }

    public record MenuResponse(
            String name,
            Integer price
    ) {
        private static MenuResponse from(Menu menu) {
            return new MenuResponse(menu.name(), menu.price());
        }
    }
}
