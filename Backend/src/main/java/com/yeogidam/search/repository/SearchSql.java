package com.yeogidam.search.repository;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.List;

public final class SearchSql {

    private SearchSql() {
    }

    public static String containsCondition(String column) {
        String field = "COALESCE(%s, '')".formatted(column);
        for (int separator : SearchQuery.WORD_SEPARATORS.codePoints().toArray()) {
            String encoded = HexFormat.of().formatHex(Character.toString(separator).getBytes(StandardCharsets.UTF_8));
            field = "REPLACE(%s, _utf8mb4 X'%s', '')".formatted(field, encoded);
        }
        return "LOWER(%s) LIKE ? ESCAPE '!'".formatted(field);
    }

    public static List<String> containsPatterns(SearchQuery query) {
        return query.getWords().stream()
                .map(SearchSql::containsPattern)
                .toList();
    }

    private static String containsPattern(String word) {
        String escaped = word.replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");
        return "%" + escaped + "%";
    }
}
