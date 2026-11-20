package com.yeogidam.global.seed;

import java.sql.Connection;
import javax.sql.DataSource;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.stereotype.Component;

@Order(1)
@Component
@Profile("local & !test & !dev & !prod")
@RequiredArgsConstructor
public class LocalDataSeeder implements ApplicationRunner {

    private final DataSource dataSource;

    @Override
    public void run(ApplicationArguments arguments) throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/seed/data-local.sql"));
                ScriptUtils.executeSqlScript(connection, new ClassPathResource("db/seed/data-onboarding.sql"));
                connection.commit();
            } catch (Exception exception) {
                connection.rollback();
                throw exception;
            }
        }
    }
}
