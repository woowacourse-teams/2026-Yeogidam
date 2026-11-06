package com.yeogidam.search.domain;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import lombok.Getter;

@Getter
public final class SearchQuery {

    private static final int MAX_LENGTH = 100;
    private static final Pattern WORD_SEPARATOR = Pattern.compile("[ \\t\\r\\n]+");

    private final List<String> words;

    public SearchQuery(String query) {
        String trimmed = trim(query);
        validate(trimmed);
        this.words = List.of(WORD_SEPARATOR.split(trimmed.toLowerCase(Locale.ROOT)));
    }

    private String trim(String query) {
        if (query == null) {
            return null;
        }
        return query.strip();
    }

    private void validate(String query) {
        if (query == null) {
            throw new IllegalArgumentException("검색어가 필요합니다.");
        }
        if (query.isEmpty() || query.length() > MAX_LENGTH) {
            throw new IllegalArgumentException("검색어는 앞뒤 공백을 제외하고 1자 이상 100자 이하여야 합니다.");
        }
    }
}
