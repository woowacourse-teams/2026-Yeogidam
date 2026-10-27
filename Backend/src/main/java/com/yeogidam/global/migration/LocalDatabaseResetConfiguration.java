package com.yeogidam.global.migration;

import java.net.URI;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Arrays;
import java.util.Set;
import org.flywaydb.core.Flyway;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

/**
 * 로컬 앱을 실행할 때마다 새 마이그레이션을 적용하고 업무 데이터만 초기화한다.
 * 테이블과 Flyway 실행 기록은 유지하므로 migrate()는 아직 적용하지 않은 버전만 실행한다.
 * 마이그레이션이 끝나면 공용 cleanup.sql의 TRUNCATE로 업무 데이터와 자동 증가 ID를 초기화한다.
 * Flyway 실행 기록은 정리 대상에서 제외한다. 마이그레이션이 실패하면 데이터를 비우지 않는다.
 * 이후 회원과 샘플 데이터를 넣는 일은 LocalMemberSeeder와 LocalDataSeeder가 담당한다.
 * DB 이름은 DB_URL로 연결한 DB를 그대로 사용하며, 로컬 주소인지 확인한 뒤 실행한다.
 * local 프로필에서만 사용하며 test, dev, prod 프로필이 함께 있으면 실행하지 않는다.
 */
@Configuration
@Profile("local & !test & !dev & !prod")
public class LocalDatabaseResetConfiguration {

    private static final Set<String> LOCAL_HOSTS = Set.of("localhost", "127.0.0.1", "[::1]", "::1");

    @Bean
    public FlywayMigrationStrategy localDatabaseReset() {
        return flyway -> {
            verifyLocalDatabase(flyway);
            flyway.migrate();
            truncateLocalData(flyway);
        };
    }

    private void truncateLocalData(Flyway flyway) {
        try (Connection connection = flyway.getConfiguration().getDataSource().getConnection();
                Statement statement = connection.createStatement()) {
            try {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("cleanup.sql"));
            } finally {
                // TRUNCATE 도중 실패해도 같은 연결의 외래키 검사를 다시 켠 뒤 반환한다.
                statement.execute("SET FOREIGN_KEY_CHECKS = 1");
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("로컬 DB의 데이터를 초기화할 수 없습니다.", exception);
        }
    }

    // DB_URL로 연결한 로컬 DB와 Flyway 대상이 같은지 확인한다. DB 이름은 제한하지 않는다.
    private void verifyLocalDatabase(Flyway flyway) {
        try (Connection connection = flyway.getConfiguration().getDataSource().getConnection()) {
            URI uri = URI.create(connection.getMetaData().getURL().substring("jdbc:".length()));
            if (!LOCAL_HOSTS.contains(uri.getHost())) {
                throw new IllegalStateException("초기화는 localhost 등 로컬 주소의 DB에서만 가능합니다.");
            }
            String localSchema = connection.getCatalog();
            if (localSchema == null || localSchema.isBlank()) {
                throw new IllegalStateException("DB_URL에 초기화할 DB 이름을 지정해야 합니다.");
            }
            String defaultSchema = flyway.getConfiguration().getDefaultSchema();
            if ((defaultSchema != null && !localSchema.equals(defaultSchema))
                    || Arrays.stream(flyway.getConfiguration().getSchemas())
                            .anyMatch(schema -> !localSchema.equals(schema))) {
                throw new IllegalStateException("Flyway 대상은 DB_URL로 연결한 DB 하나여야 합니다.");
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("로컬 DB 초기화 대상을 확인할 수 없습니다.", exception);
        }
    }
}
