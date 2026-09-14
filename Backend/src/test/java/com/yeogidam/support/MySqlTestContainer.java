package com.yeogidam.support;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.MySQLContainer;

public final class MySqlTestContainer {

    private static final MySQLContainer<?> CONTAINER = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("oauth")
            .withUsername("test")
            .withPassword("test");

    static {
        CONTAINER.start();
    }

    private MySqlTestContainer() {
    }

    public static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", CONTAINER::getJdbcUrl);
        registry.add("spring.datasource.username", CONTAINER::getUsername);
        registry.add("spring.datasource.password", CONTAINER::getPassword);
        registry.add("spring.datasource.driver-class-name", CONTAINER::getDriverClassName);
    }
}
