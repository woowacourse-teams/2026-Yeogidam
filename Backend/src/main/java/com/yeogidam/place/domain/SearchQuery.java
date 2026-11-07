package com.yeogidam.place.domain;

import com.yeogidam.place.exception.PlaceErrorCode;
import com.yeogidam.place.exception.PlaceException;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import lombok.Getter;

@Getter
public final class SearchQuery {

    public static final String WORD_SEPARATORS = " \t\r\n";

    private static final int MAX_LENGTH = 100;
    private static final Pattern WORD_SEPARATOR = Pattern.compile("[" + WORD_SEPARATORS + "]+");

    private final List<String> words;

    public SearchQuery(String query) {
        String trimmed = trim(query);
        validate(trimmed);
        this.words = List.of(WORD_SEPARATOR.split(trimmed.toLowerCase(Locale.ROOT)));
    }

    static String normalizeForMatching(String value) {
        return WORD_SEPARATOR.matcher(value).replaceAll("").toLowerCase(Locale.ROOT);
    }

    private String trim(String query) {
        if (query == null) {
            return null;
        }
        return query.strip();
    }

    private void validate(String query) {
        if (query == null || query.isEmpty() || query.length() > MAX_LENGTH) {
            throw new PlaceException(PlaceErrorCode.INVALID_SEARCH_QUERY);
        }
    }
}
