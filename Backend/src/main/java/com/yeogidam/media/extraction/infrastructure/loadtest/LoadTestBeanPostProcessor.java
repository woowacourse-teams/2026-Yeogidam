package com.yeogidam.media.extraction.infrastructure.loadtest;

import com.yeogidam.media.extraction.service.MediaExtractionPipeline;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.share.dto.request.ShareRequest;
import com.yeogidam.media.share.service.ShareService;
import java.net.http.HttpClient;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.aopalliance.intercept.MethodInterceptor;
import org.aopalliance.intercept.MethodInvocation;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.web.client.RestClient;
import software.amazon.awssdk.services.s3.S3Client;

/** 명시적으로 활성화한 측정에서만 기존 빈에 관찰과 선택적 HTTP 라우팅을 붙인다. */
@RequiredArgsConstructor
public class LoadTestBeanPostProcessor implements BeanPostProcessor {

    private static final Set<String> EXTERNAL_REST_CLIENTS = Set.of(
            "instagramRestClient", "geminiRestClient", "kakaoLocalRestClient");

    private final ConfigurableListableBeanFactory beanFactory;

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if (bean instanceof RestClient client && EXTERNAL_REST_CLIENTS.contains(beanName)) {
            return client.mutate()
                    .requestInterceptor(new LoadTestRestClientInterceptor(routing(), metrics()))
                    .build();
        }
        if (bean instanceof HttpClient client && "thumbnailHttpClient".equals(beanName)) {
            return new LoadTestHttpClient(client, routing(), metrics());
        }
        if (bean instanceof ThreadPoolTaskExecutor executor && "mediaExtractionExecutor".equals(beanName)) {
            metrics().bindExecutor(executor);
            return bean;
        }
        if (bean instanceof ShareService) {
            return proxy(bean, this::validateShare);
        }
        if (bean instanceof MediaExtractionPipeline) {
            return proxy(bean, this::observeExtraction);
        }
        if (bean instanceof S3Client) {
            return proxy(bean, this::observeUpload);
        }
        return bean;
    }

    private Object validateShare(MethodInvocation invocation) throws Throwable {
        if ("createShare".equals(invocation.getMethod().getName())) {
            Object[] arguments = invocation.getArguments();
            ShareRequest request = (ShareRequest) arguments[1];
            policy().validateShare((Long) arguments[0], new InstagramUrl(request.instagramUrl()));
        }
        return invocation.proceed();
    }

    private Object observeExtraction(MethodInvocation invocation) throws Throwable {
        if (!"extract".equals(invocation.getMethod().getName())) {
            return invocation.proceed();
        }
        try {
            Object result = extractInScope(invocation);
            metrics().recordSucceeded();
            return result;
        } catch (Throwable exception) {
            metrics().recordFailed();
            throw exception;
        }
    }

    private Object extractInScope(MethodInvocation invocation) throws Throwable {
        Object[] arguments = invocation.getArguments();
        InstagramUrl url = (InstagramUrl) arguments[1];
        if (!policy().canUseFake((Long) arguments[0], url)) {
            return invocation.proceed();
        }
        try (LoadTestScope ignored = LoadTestScope.open(url.getMediaShortcode().value())) {
            return invocation.proceed();
        }
    }

    private Object observeUpload(MethodInvocation invocation) throws Throwable {
        if (!"putObject".equals(invocation.getMethod().getName())) {
            return invocation.proceed();
        }
        long startedAt = System.nanoTime();
        try {
            Object result = invocation.proceed();
            metrics().recordExternal("s3", false, startedAt, "success");
            return result;
        } catch (Throwable exception) {
            metrics().recordExternal("s3", false, startedAt, "error");
            throw exception;
        }
    }

    private Object proxy(Object target, MethodInterceptor interceptor) {
        ProxyFactory factory = new ProxyFactory(target);
        if (!(target instanceof S3Client)) {
            factory.setProxyTargetClass(true);
        }
        factory.addAdvice(interceptor);
        return factory.getProxy();
    }

    private LoadTestHttpRouting routing() {
        return beanFactory.getBean(LoadTestHttpRouting.class);
    }

    private LoadTestMetrics metrics() {
        return beanFactory.getBean(LoadTestMetrics.class);
    }

    private LoadTestRoutingPolicy policy() {
        return beanFactory.getBean(LoadTestRoutingPolicy.class);
    }
}
