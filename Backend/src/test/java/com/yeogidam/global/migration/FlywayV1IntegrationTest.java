package com.yeogidam.global.migration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertAll;

import com.yeogidam.global.seed.LocalDataSeeder;
import com.yeogidam.global.seed.LocalMemberSeeder;
import com.yeogidam.support.MySqlContainerSupport;
import java.sql.Connection;
import java.util.UUID;
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

class FlywayV1IntegrationTest extends MySqlContainerSupport {

    @Test
    void 빈_DB로_서버를_시작하면_기존_구조의_V1만_자동_적용한다() {
        // given
        try (IsolatedDatabase database = new IsolatedDatabase("")) {
            // when
            try (ConfigurableApplicationContext ignored = database.boot("prod")) {
                // then
                assertAll(
                        () -> assertThat(database.count("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1"))
                                .isEqualTo(1),
                        () -> assertThat(database.jdbc.queryForObject(
                                "SELECT version FROM flyway_schema_history WHERE success = 1", String.class))
                                .isEqualTo("1"),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM media")).isZero(),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM members")).isZero(),
                        () -> assertThat(database.count("""
                                SELECT COUNT(*) FROM information_schema.tables
                                WHERE table_schema = DATABASE() AND table_name = 'extraction_attempts'
                                """)).isZero()
                );
            }
        }
    }

    @Test
    void 기존_DB로_서버를_시작하면_baseline_1을_자동_등록하고_재시작해도_원본_데이터를_보존한다() throws Exception {
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
            for (int run = 0; run < 2; run++) {
                try (ConfigurableApplicationContext ignored = database.boot("prod")) {
                    // then
                    assertAll(
                            () -> assertThat(database.jdbc.queryForObject("SELECT nickname FROM members WHERE id = 41",
                                    String.class)).isEqualTo("기존 회원"),
                            () -> assertThat(database.count("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1"))
                                    .isEqualTo(1),
                            () -> assertThat(database.jdbc.queryForObject("SELECT type FROM flyway_schema_history "
                                    + "WHERE version = '1'", String.class)).isEqualTo("BASELINE")
                    );
                }
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
            }

            // when
            try (ConfigurableApplicationContext ignored = database.boot("local")) {
                // then
                assertAll(
                        () -> assertThat(database.count("SELECT COUNT(*) FROM members")).isEqualTo(2),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM media")).isEqualTo(8),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM shared_media")).isEqualTo(9),
                        () -> assertThat(database.count("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1"))
                                .isEqualTo(1),
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

        private IsolatedDatabase(String suffix) {
            schema = "flyway_v1_" + UUID.randomUUID().toString().replace("-", "") + suffix;
            String baseUrl = "jdbc:mysql://" + MYSQL_CONTAINER.getHost() + ":" + MYSQL_CONTAINER.getMappedPort(3306);
            administrator = new JdbcTemplate(new DriverManagerDataSource(
                    baseUrl + "/mysql", "root", MYSQL_CONTAINER.getPassword()));
            administrator.execute("CREATE DATABASE " + schema);
            source = new DriverManagerDataSource(baseUrl + "/" + schema + "?connectionTimeZone=UTC",
                    "root", MYSQL_CONTAINER.getPassword());
            jdbc = new JdbcTemplate(source);
        }

        private ConfigurableApplicationContext boot(String profiles) {
            return new SpringApplicationBuilder(DatabaseBoot.class).web(WebApplicationType.NONE).run(
                    "--spring.config.location=optional:classpath:/isolated-flyway-test.yml",
                    "--spring.profiles.active=" + profiles,
                    "--spring.datasource.url=" + source.getUrl(),
                    "--spring.datasource.username=root",
                    "--spring.datasource.password=" + MYSQL_CONTAINER.getPassword(),
                    "--spring.sql.init.mode=never",
                    "--spring.flyway.baseline-on-migrate=true",
                    "--spring.flyway.clean-disabled=true");
        }

        private int count(String sql) {
            return jdbc.queryForObject(sql, Integer.class);
        }

        @Override
        public void close() {
            administrator.execute("DROP DATABASE " + schema);
        }
    }
}
