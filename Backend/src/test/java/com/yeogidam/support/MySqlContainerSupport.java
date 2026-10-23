package com.yeogidam.support;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.mysql.MySQLContainer;

/**
 * 슬라이스, 통합, E2E 테스트가 공유하는 MySQL 컨테이너.
 * 정적 필드에서 한 번만 띄우고 schema.sql로 테이블을 만들어 여러 스프링 컨텍스트가 같은 DB를 쓰며,
 * JVM이 끝날 때 Testcontainers가 거둔다. 데이터소스 접속 정보는 프로필 파일이 아니라 여기서 동적으로 주입한다.
 */
public abstract class MySqlContainerSupport {

    private static final String MYSQL_IMAGE = "mysql:8.4";
    private static final String SCHEMA_SCRIPT = "schema.sql";
    private static final String TIME_ZONE_PARAMS =
            "connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&preserveInstants=true";

    protected static final MySQLContainer MYSQL_CONTAINER = new MySQLContainer(MYSQL_IMAGE)
            .withDatabaseName("yeogidam_test")
            .withUsername("test")
            .withPassword("test");

    static {
        MYSQL_CONTAINER.start();
        createSchema();
    }

    private static void createSchema() {
        try (Connection connection = DriverManager.getConnection(
                jdbcUrlWithUtcTimeZone(), MYSQL_CONTAINER.getUsername(), MYSQL_CONTAINER.getPassword())) {
            ScriptUtils.executeSqlScript(connection, new ClassPathResource(SCHEMA_SCRIPT));
        } catch (SQLException exception) {
            throw new IllegalStateException("테스트 DB에 스키마를 만들 수 없습니다.", exception);
        }
    }

    @DynamicPropertySource
    static void registerMySqlProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MySqlContainerSupport::jdbcUrlWithUtcTimeZone);
        registry.add("spring.datasource.username", MYSQL_CONTAINER::getUsername);
        registry.add("spring.datasource.password", MYSQL_CONTAINER::getPassword);
    }

    private static String jdbcUrlWithUtcTimeZone() {
        String jdbcUrl = MYSQL_CONTAINER.getJdbcUrl();
        if (jdbcUrl.contains("?")) {
            return jdbcUrl + "&" + TIME_ZONE_PARAMS;
        }
        return jdbcUrl + "?" + TIME_ZONE_PARAMS;
    }
}
