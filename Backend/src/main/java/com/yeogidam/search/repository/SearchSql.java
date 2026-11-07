package com.yeogidam.search.repository;

import com.yeogidam.search.domain.SearchQuery;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

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
}
