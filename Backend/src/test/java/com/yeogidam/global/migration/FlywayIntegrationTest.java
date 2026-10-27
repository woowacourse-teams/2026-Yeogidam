package com.yeogidam.global.migration;

import static com.yeogidam.support.fixture.sql.MemberSqlFixture.insertKakaoMember;
import static com.yeogidam.support.fixture.sql.PlaceSqlFixture.insertPlaceWithRequiredColumnsOnly;
import static com.yeogidam.support.fixture.sql.SavedPlaceSqlFixture.insertSavedPlace;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.global.seed.LocalDataSeeder;
import com.yeogidam.global.seed.LocalMemberSeeder;
import com.yeogidam.support.MySqlContainerSupport;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;

class FlywayIntegrationTest extends MySqlContainerSupport {

    @ParameterizedTest
    @ValueSource(strings = {"dev", "prod"})
    void 앱은_DML_계정으로_접속하고_Flyway는_전용_계정으로_미적용_마이그레이션을_적용한다(String profile) {
        // given
        try (IsolatedDatabase database = new IsolatedDatabase("")) {
            // when
            try (ConfigurableApplicationContext context = database.boot(profile)) {
                // then
                assertAll(
                        () -> assertThat(new JdbcTemplate(context.getBean(DataSource.class))
                                .queryForObject("SELECT CURRENT_USER()", String.class))
                                .isEqualTo(database.appUsername + "@%"),
                        () -> assertThat(database.jdbc.queryForObject(
                                "SELECT installed_by FROM flyway_schema_history WHERE version = '1'", String.class))
                                .startsWith(database.migratorUsername),
                        () -> assertThat(context.getBean(Flyway.class).info().pending()).isEmpty(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM media")).isZero(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM members")).isZero(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM folders")).isZero(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM folder_saved_places")).isZero()
                );
            }
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"dev", "prod"})
    void 전용_계정으로_baseline_1을_등록하고_재시작해도_원본_데이터를_보존한다(String profile) throws Exception {
        // given: Flyway 이력 없이 기존 운영과 같은 V1 구조를 준비한다.
        try (IsolatedDatabase database = new IsolatedDatabase("")) {
            try (Connection connection = database.source.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/migration/V1__initial_schema.sql"));
            }
            database.jdbc.update("""
                    INSERT INTO members (id, oauth_provider, provider_user_id, nickname)
                    VALUES (41, 'KAKAO', 'keep-original', '기존 회원')
                    """);

            // when
            try (ConfigurableApplicationContext context = database.boot(profile)) {
                // then
                assertAll(
                        () -> assertThat(database.jdbc.queryForObject("SELECT nickname FROM members WHERE id = 41",
                                String.class)).isEqualTo("기존 회원"),
                        () -> assertThat(database.jdbc.queryForObject("SELECT type FROM flyway_schema_history "
                                + "WHERE version = '1'", String.class)).isEqualTo("BASELINE"),
                        () -> assertThat(database.jdbc.queryForObject("SELECT installed_by FROM flyway_schema_history "
                                + "WHERE version = '1'", String.class)).startsWith(database.migratorUsername),
                        () -> assertThat(context.getBean(Flyway.class).info().pending()).isEmpty(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM folders")).isZero(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM folder_saved_places")).isZero()
                );
            }
            List<Map<String, Object>> history = database.migrationHistory();

            // when
            try (ConfigurableApplicationContext context = database.boot(profile)) {
                // then
                assertAll(
                        () -> assertThat(database.migrationHistory()).isEqualTo(history),
                        () -> assertThat(database.jdbc.queryForObject("SELECT nickname FROM members WHERE id = 41",
                                String.class)).isEqualTo("기존 회원"),
                        () -> assertThat(context.getBean(Flyway.class).info().pending()).isEmpty()
                );
            }
        }
    }

    @Test
    void V1_이력이_있는_개발_DB에_마이그레이션을_적용해도_기존_보관함을_보존한다() {
        // given
        try (IsolatedDatabase database = new IsolatedDatabase("")) {
            Flyway.configure().dataSource(database.source).target("1").load().migrate();
            List<Map<String, Object>> history = database.migrationHistory();
            Instant savedAt = Instant.parse("2026-10-27T00:00:00.123456Z");
            insertKakaoMember(database.jdbc, 41L, "keep-saved-place", "기존 회원", null, null);
            insertPlaceWithRequiredColumnsOnly(database.jdbc, 71L, "keep-place", "기존 장소", "서울 성동구",
                    new BigDecimal("37.5"), new BigDecimal("127.0"));
            insertSavedPlace(database.jdbc, 91L, 41L, 71L, savedAt);

            // when
            try (ConfigurableApplicationContext context = database.boot("dev")) {
                // then
                assertAll(
                        () -> assertThat(database.migrationHistory()).containsAll(history),
                        () -> assertThat(context.getBean(Flyway.class).info().pending()).isEmpty(),
                        () -> assertThat(database.jdbc.queryForObject("SELECT place_id FROM saved_places WHERE id = 91",
                                Long.class)).isEqualTo(71L),
                        () -> assertThat(database.jdbc.queryForObject(
                                "SELECT last_saved_at FROM saved_places WHERE id = 91", Timestamp.class).toInstant())
                                .isEqualTo(savedAt),
                        () -> assertThat(database.jdbc.queryForObject("SELECT name FROM places WHERE id = 71",
                                String.class)).isEqualTo("기존 장소"),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM folders")).isZero(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM folder_saved_places")).isZero()
                );
            }
        }
    }

    @Test
    void 로컬_DB를_재시작하면_구조와_이력을_유지하고_데이터와_ID만_초기화한다() {
        try (IsolatedDatabase database = new IsolatedDatabase("")) {
            try (ConfigurableApplicationContext ignored = database.boot("local")) {
                assertThat(database.count("SELECT COUNT(*) FROM media")).isEqualTo(8);
                database.jdbc.update("INSERT INTO members (oauth_provider, provider_user_id) VALUES ('KAKAO', 'extra')");
                database.jdbc.execute("CREATE INDEX idx_local_restart_nickname ON members (nickname)");
                database.jdbc.update("""
                        UPDATE flyway_schema_history SET installed_by = 'first-local-start' WHERE version = '1'
                        """);
                database.jdbc.update("""
                        INSERT INTO folders (id, member_id, name, color)
                        VALUES (51, 1, '로컬 폴더', 'BLUE')
                        """);
                Long savedPlaceId = database.jdbc.queryForObject(
                        "SELECT id FROM saved_places WHERE member_id = 1 ORDER BY id LIMIT 1", Long.class);
                database.jdbc.update("""
                        INSERT INTO folder_saved_places (id, folder_id, saved_place_id)
                        VALUES (61, 51, ?)
                        """, savedPlaceId);
            }
            List<Map<String, Object>> history = database.migrationHistory();

            // when
            try (ConfigurableApplicationContext ignored = database.boot("local")) {
                // then
                assertAll(
                        () -> assertThat(database.count("SELECT COUNT(*) FROM members")).isEqualTo(2),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM media")).isEqualTo(8),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM shared_media")).isEqualTo(9),
                        () -> assertThat(database.migrationHistory()).isEqualTo(history),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM folders")).isZero(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM folder_saved_places")).isZero(),
                        () -> assertThat(database.jdbc.queryForObject("SELECT installed_by FROM flyway_schema_history "
                                + "WHERE version = '1'", String.class)).isEqualTo("first-local-start"),
                        () -> assertThat(database.count("""
                                SELECT COUNT(*) FROM information_schema.statistics
                                WHERE table_schema = DATABASE() AND index_name = 'idx_local_restart_nickname'
                                """)).isEqualTo(1)
                );
                database.jdbc.update("INSERT INTO members (oauth_provider, provider_user_id) VALUES ('KAKAO', 'extra')");
                assertThat(database.jdbc.queryForObject("SELECT id FROM members WHERE provider_user_id = 'extra'",
                        Long.class)).isEqualTo(3L);
                database.jdbc.update("""
                        INSERT INTO folders (member_id, name, color) VALUES (1, '다시 만든 폴더', 'BLUE')
                        """);
                assertThat(database.jdbc.queryForObject("SELECT id FROM folders", Long.class)).isEqualTo(1L);
            }
        }
    }

    @Test
    void 접속_URL과_다른_DB를_Flyway_대상으로_지정하면_변경_전에_예외가_발생한다() {
        // given
        try (IsolatedDatabase database = new IsolatedDatabase("");
                IsolatedDatabase otherDatabase = new IsolatedDatabase("")) {
            Flyway flyway = Flyway.configure().dataSource(database.source).load();
            flyway.migrate();
            database.jdbc.update("INSERT INTO members (id, oauth_provider, provider_user_id) VALUES (41, 'KAKAO', 'keep')");
            Flyway otherSchemaFlyway = Flyway.configure()
                    .dataSource(database.source)
                    .schemas(otherDatabase.schema)
                    .defaultSchema(otherDatabase.schema)
                    .load();

            // when & then
            assertThatThrownBy(() -> new LocalDatabaseResetConfiguration()
                    .localDatabaseReset().migrate(otherSchemaFlyway))
                    .isInstanceOf(IllegalStateException.class);
            assertAll(
                    () -> assertThat(database.jdbc.queryForObject("SELECT id FROM members", Long.class)).isEqualTo(41L),
                    () -> assertThat(otherDatabase.count("""
                            SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()
                            """)).isZero()
            );
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"dev", "prod"})
    void 서버_프로필이_있으면_로컬_삭제와_샘플_삽입을_실행하지_않는다(String profile) {
        // given
        try (IsolatedDatabase database = new IsolatedDatabase("_local")) {
            Flyway.configure().dataSource(database.source).load().migrate();
            database.jdbc.update("INSERT INTO members (id, oauth_provider, provider_user_id) VALUES (41, 'KAKAO', 'keep')");

            // when
            try (ConfigurableApplicationContext context = database.boot("local," + profile)) {
                // then
                assertAll(
                        () -> assertThat(context.getBeansOfType(LocalDatabaseResetConfiguration.class)).isEmpty(),
                        () -> assertThat(context.getBeansOfType(LocalMemberSeeder.class)).isEmpty(),
                        () -> assertThat(context.getBeansOfType(LocalDataSeeder.class)).isEmpty(),
                        () -> assertThat(database.jdbc.queryForObject("SELECT id FROM members", Long.class)).isEqualTo(41L)
                );
            }
        }
    }

    @TestConfiguration
    @EnableAutoConfiguration
    @Import({LocalDatabaseResetConfiguration.class, LocalMemberSeeder.class, LocalDataSeeder.class})
    static class DatabaseBoot {
    }

    private static class IsolatedDatabase implements AutoCloseable {

        private final String schema;
        private final DriverManagerDataSource source;
        private final JdbcTemplate jdbc;
        private final JdbcTemplate administrator;
        private final String appUsername;
        private final String migratorUsername;

        private IsolatedDatabase(String suffix) {
            schema = "flyway_test_" + UUID.randomUUID().toString().replace("-", "") + suffix;
            String baseUrl = "jdbc:mysql://" + MYSQL_CONTAINER.getHost() + ":" + MYSQL_CONTAINER.getMappedPort(3306);
            administrator = new JdbcTemplate(new DriverManagerDataSource(
                    baseUrl + "/mysql", "root", MYSQL_CONTAINER.getPassword()));
            source = new DriverManagerDataSource(baseUrl + "/" + schema + "?connectionTimeZone=UTC",
                    "root", MYSQL_CONTAINER.getPassword());
            jdbc = new JdbcTemplate(source);
            String accountSuffix = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            appUsername = "flyway_app_" + accountSuffix;
            migratorUsername = "flyway_migrator_" + accountSuffix;
            try {
                createDatabaseAndAccounts();
            } catch (RuntimeException exception) {
                try {
                    close();
                } catch (RuntimeException cleanupException) {
                    exception.addSuppressed(cleanupException);
                }
                throw exception;
            }
        }

        private void createDatabaseAndAccounts() {
            administrator.execute("CREATE DATABASE " + schema);
            administrator.execute("CREATE USER '" + appUsername + "'@'%' IDENTIFIED BY 'test-app'");
            administrator.execute("CREATE USER '" + migratorUsername + "'@'%' IDENTIFIED BY 'test-migrator'");
            administrator.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON " + schema + ".* TO '" + appUsername + "'@'%'");
            administrator.execute("GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES ON "
                    + schema + ".* TO '" + migratorUsername + "'@'%'");
        }

        private ConfigurableApplicationContext boot(String profiles) {
            List<String> arguments = new ArrayList<>(List.of(
                    "--spring.config.location=classpath:/application.yml",
                    "--spring.profiles.active=" + profiles,
                    "--DB_URL=" + source.getUrl()));
            if (profiles.contains("dev") || profiles.contains("prod")) {
                arguments.addAll(List.of("--DB_USERNAME=" + appUsername, "--DB_PASSWORD=test-app",
                        "--FLYWAY_USERNAME=" + migratorUsername, "--FLYWAY_PASSWORD=test-migrator"));
            }
            if (!profiles.contains("dev") && !profiles.contains("prod")) {
                arguments.addAll(List.of("--DB_USERNAME=root", "--DB_PASSWORD=" + MYSQL_CONTAINER.getPassword()));
            }
            return new SpringApplicationBuilder(DatabaseBoot.class)
                    .web(WebApplicationType.NONE)
                    .initializers(context -> {
                        // 실제 설정을 읽되, 개발자 환경변수 때문에 컨테이너 밖으로 접속하지 않게 먼저 막는다.
                        String datasourceUrl = context.getEnvironment().getProperty("spring.datasource.url");
                        String flywayUrl = context.getEnvironment().getProperty("spring.flyway.url", datasourceUrl);
                        if (!source.getUrl().equals(datasourceUrl) || !source.getUrl().equals(flywayUrl)) {
                            throw new IllegalStateException("Flyway 테스트는 격리된 Testcontainers DB만 사용할 수 있습니다.");
                        }
                    })
                    .run(arguments.toArray(String[]::new));
        }

        private int count(String sql) {
            return jdbc.queryForObject(sql, Integer.class);
        }

        private List<Map<String, Object>> migrationHistory() {
            return jdbc.queryForList("SELECT * FROM flyway_schema_history ORDER BY installed_rank");
        }

        @Override
        public void close() {
            try {
                administrator.execute("DROP DATABASE IF EXISTS " + schema);
            } finally {
                administrator.execute("DROP USER IF EXISTS '" + appUsername + "'@'%', '" + migratorUsername + "'@'%'");
            }
        }
    }
}
