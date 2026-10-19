package com.yeogidam.auth.config;

import com.yeogidam.auth.interceptor.LoginCheckInterceptor;
import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.auth.resolver.LoginMemberArgumentResolver;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * /api 아래는 전부 로그인이 필요하고, 로그인과 재발급과 로그아웃이 있는 /api/v1/auth 아래와
 * 앱이 로그인 전에 부르는 /api/v1/app-update-policies만 예외다.
 */
@Configuration
@RequiredArgsConstructor
public class AuthenticationConfig implements WebMvcConfigurer {

    private static final String API_PATH_PATTERN = "/api/**";
    private static final String AUTH_PATH_PATTERN = "/api/v1/auth/**";
    private static final String APP_UPDATE_POLICY_PATH = "/api/v1/app-update-policies";

    static {
        SpringDocUtils.getConfig()
                .addAnnotationsToIgnore(LoginMember.class);
    }

    private final LoginCheckInterceptor loginCheckInterceptor;
    private final LoginMemberArgumentResolver loginMemberArgumentResolver;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loginCheckInterceptor)
                .addPathPatterns(API_PATH_PATTERN)
                .excludePathPatterns(AUTH_PATH_PATTERN, APP_UPDATE_POLICY_PATH);
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(loginMemberArgumentResolver);
    }
}
