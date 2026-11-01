# syntax=docker/dockerfile:1

FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /workspace

COPY gradle ./gradle
COPY gradlew build.gradle settings.gradle ./

RUN chmod +x gradlew \
    && ./gradlew dependencies --configuration runtimeClasspath --no-daemon > /dev/null

COPY src ./src

RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-alpine

RUN addgroup -S app \
    && adduser -S -G app app

# 공식 릴리스의 버전과 SHA-256을 함께 고정한다. JAR는 app 사용자도 읽을 수 있어야 한다.
ADD --chown=app:app --chmod=0444 \
    --checksum=sha256:e43a270df53c6f423e0ab157be9c27ccc01d5dc3232e162fe54777573db2f149 \
    https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.33.1/opentelemetry-javaagent.jar \
    /opt/otel/opentelemetry-javaagent.jar

# ADD의 chmod가 새 상위 디렉터리에도 적용되므로 app 사용자가 경로를 통과할 수 있게 한다.
RUN chmod 0555 /opt/otel

WORKDIR /app

COPY --from=builder --chown=app:app /workspace/build/libs/*.jar app.jar

USER app

# Java 21은 cgroup 상한을 읽어 힙을 정하는데 기본이 25%다. --memory 512m이면 힙이
# 128MB라 스프링 부트에 빠듯하다. 힙 밖 몫(메타스페이스, 스레드 스택, 코드 캐시,
# 다이렉트 버퍼)이 150~200MB쯤 되므로 절반씩 나눈다. 어디서 띄우든 같아야 하니
# 배포 스크립트가 아니라 이미지에 둔다.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=50.0"

# Alloy와 저장소를 준비한 서버에서 --env-file로 false를 전달한 뒤 컨테이너를 재생성한다.
ENV OTEL_SDK_DISABLED=true

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD wget --quiet --spider http://127.0.0.1:8080/actuator/health/liveness || exit 1

ENTRYPOINT ["java", "-javaagent:/opt/otel/opentelemetry-javaagent.jar", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]
