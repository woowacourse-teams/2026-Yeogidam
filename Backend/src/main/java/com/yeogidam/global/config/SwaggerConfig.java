package com.yeogidam.global.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import jakarta.servlet.ServletContext;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SwaggerConfig {

    private static final String ACCESS_TOKEN_SCHEME = "access-token";

    @Bean
    public OpenAPI openAPI(ServletContext servletContext) {
        Server server = new Server().url(servletContext.getContextPath());

        return new OpenAPI()
                .servers(List.of(server))
                .components(authSetting())
                .info(swaggerInfo());
    }

    private Info swaggerInfo() {
        return new Info()
                .version("v1.0.0")
                .title("Yeogidam API")
                .description("여기담 API 문서입니다.");
    }

    /**
     * 액세스 토큰을 Authorize 버튼으로 넣을 수 있게 bearer 스킴만 등록한다.
     * 지금은 인증이 필요한 API가 없어서 전역 SecurityRequirement는 걸지 않고, 보호 API가 생기면 그때 @SecurityRequirement로 표시한다.
     */
    private Components authSetting() {
        return new Components()
                .addSecuritySchemes(
                        ACCESS_TOKEN_SCHEME,
                        new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .in(SecurityScheme.In.HEADER)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .name("Authorization")
                );
    }
}
