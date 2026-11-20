package com.yeogidam.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * 로컬 초기화용 cleanup.sql에 테이블이 추가되면 테스트 전용 test-cleanup.sql에도 같은 테이블이 있어야 한다.
 */
class TestCleanupSqlTest {

    private static final Pattern TRUNCATE_TABLE = Pattern.compile("TRUNCATE TABLE (\\w+);");
    private static final Pattern DELETE_FROM = Pattern.compile("DELETE FROM (\\w+);");
    private static final Pattern RESET_AUTO_INCREMENT = Pattern.compile("ALTER TABLE (\\w+) AUTO_INCREMENT = 1;");

    @Test
    void 테스트_정리_SQL은_로컬_정리_SQL과_같은_테이블을_비운다() throws IOException {
        // given
        List<String> localTables = findTables(read("cleanup.sql"), TRUNCATE_TABLE);

        // when
        List<String> deletedTables = findTables(read("test-cleanup.sql"), DELETE_FROM);

        // then
        assertThat(deletedTables).containsExactlyElementsOf(localTables);
    }

    @Test
    void 테스트_정리_SQL은_비운_테이블마다_자동_증가_값을_초기화한다() throws IOException {
        // given
        String sql = read("test-cleanup.sql");

        // when
        List<String> resetTables = findTables(sql, RESET_AUTO_INCREMENT);

        // then
        assertThat(resetTables).containsExactlyElementsOf(findTables(sql, DELETE_FROM));
    }

    private static String read(String path) throws IOException {
        try (InputStream inputStream = new ClassPathResource(path).getInputStream()) {
            return new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static List<String> findTables(String sql, Pattern pattern) {
        Matcher matcher = pattern.matcher(sql);
        return matcher.results()
                .map(result -> result.group(1))
                .toList();
    }
}
