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

WORKDIR /app

COPY --from=builder --chown=app:app /workspace/build/libs/*.jar app.jar

USER app

# Java 21은 cgroup 상한을 읽어 힙을 정하는데 기본이 25%다. --memory 512m이면 힙이
# 128MB라 스프링 부트에 빠듯하다. 힙 밖 몫(메타스페이스, 스레드 스택, 코드 캐시,
# 다이렉트 버퍼)이 150~200MB쯤 되므로 절반씩 나눈다. 어디서 띄우든 같아야 하니
# 배포 스크립트가 아니라 이미지에 둔다.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=50.0"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD wget --quiet --spider http://127.0.0.1:8080/actuator/health/liveness || exit 1

ENTRYPOINT ["java", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]
