package com.yeogidam.media.extraction.infrastructure;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.domain.ExtractionReport;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.DownloadedMedia;
import java.net.URI;
import java.nio.file.Files;
import java.time.Duration;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;

/** 분석용 이미지와 영상을 Gemini에 업로드하고, 처리 상태 확인과 업로드 파일 삭제를 담당한다. */
@Slf4j
@Component
public class GeminiFileClient {

    private static final URI BASE_URI = URI.create("https://generativelanguage.googleapis.com");
    private static final Duration PROCESSING_TIMEOUT = Duration.ofMinutes(2);

    // 파일 상태가 PROCESSING일 때 다음 상태 조회까지 기다리는 간격 (1초)
    private static final long POLL_MILLIS = 1000;

    private final RestClient restClient;
    private final URI baseUri;
    private final Duration processingTimeout;

    @Autowired
    public GeminiFileClient(@Qualifier("geminiMediaRestClient") RestClient restClient) {
        this(restClient, BASE_URI, PROCESSING_TIMEOUT);
    }

    GeminiFileClient(
            RestClient restClient,
            URI baseUri,
            Duration processingTimeout
    ) {
        this.restClient = restClient;
        this.baseUri = baseUri;
        this.processingTimeout = processingTimeout;
    }

    /**
     * 로컬 임시 파일을 Gemini에 업로드하고 분석에 사용할 파일 참조를 반환한다.
     *
     * <p>먼저 파일 크기와 MIME 유형으로 업로드 세션을 생성하고, 응답 헤더에서 업로드용 URL을 얻는다.
     * 그 URL에 파일 본문과 upload, finalize 명령을 보내 전송을 완료한다.
     * 업로드용 URL과 이후 분석 요청에 전달하는 파일 URI는 서로 다른 값이다.
     *
     * <p>전송이 끝나도 파일 상태가 PROCESSING이면 아직 분석할 수 없으므로 상태를 반복 조회한다.
     * ACTIVE가 되면 파일 이름, 분석용 URI, MIME 유형을 GeminiUploadedFile로 반환한다.
     * 실제 장소 분석 요청은 호출자인 GeminiPlaceNameExtractor가 수행한다.
     *
     * <p>업로드나 처리 상태 확인에 실패하면 유효한 파일 이름을 확보한 경우 해당 파일의 삭제를 시도하고,
     * PROCESSING_FAILED로 전달한다. 대기 중 스레드가 중단되면 인터럽트 상태를 복원한다.
     * 성공한 업로드 파일은 호출자가 분석을 마친 뒤 delete로 정리해야 한다.
     * 로컬 임시 파일의 삭제는 InstagramMediaDownloader가 담당한다.
     * 올린 파일은 key의 Google 프로젝트에 묶이므로, 호출자가 key를 바꾸면 같은 원본을 새 key로 다시 올려야 한다.
     *
     * @param media 업로드할 로컬 파일 경로와 MIME 유형
     * @param apiKey 업로드와 분석에 쓸 Gemini key
     * @return ACTIVE 상태가 확인된 Gemini 파일의 이름, 분석용 URI, MIME 유형
     * @throws ExtractionFailedException 업로드, 응답 검증 또는 처리 상태 확인에 실패한 경우
     */
    public GeminiUploadedFile upload(DownloadedMedia media, String apiKey) {
        return upload(media, apiKey, new ExtractionReport());
    }

    public GeminiUploadedFile upload(
            DownloadedMedia media,
            String apiKey,
            ExtractionReport report
    ) {
        report.enterStage("GEMINI_FILE_UPLOAD");
        String name = null;
        try {
            URI uploadUri = startUpload(media, apiKey);
            JsonNode file = restClient.post()
                .uri(uploadUri)
                    .header("X-Goog-Upload-Offset", "0")
                    .header("X-Goog-Upload-Command", "upload, finalize")
                    .contentType(MediaType.parseMediaType(media.mimeType()))
                    .body(new FileSystemResource(media.path()))
                    .retrieve()
                .body(JsonNode.class);
            if (file == null) {
                throw new IllegalStateException("Gemini 업로드 응답이 비어 있습니다.");
            }
            file = file.path("file");
            name = file.path("name").asString();
            validateName(name);
            file = awaitActive(file, name, apiKey, report);
            String uri = file.path("uri").asString();
            if (uri == null || uri.isBlank()) {
                throw new IllegalStateException("Gemini 파일 참조가 없습니다.");
            }
            return new GeminiUploadedFile(name, uri, media.mimeType());
        } catch (Exception exception) {
            if (name != null && name.matches("files/[A-Za-z0-9_-]+")) {
                delete(name, apiKey);
            }
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED, exception);
        }
    }

    /** 파일 본문을 보내기 전에 업로드 세션을 생성하고, 동일한 Gemini 서버의 업로드용 URL인지 확인한다. */
    private URI startUpload(DownloadedMedia media, String apiKey) throws java.io.IOException {
        ResponseEntity<JsonNode> response = restClient.post()
                .uri(baseUri.resolve("/upload/v1beta/files"))
                .header("x-goog-api-key", apiKey)
                .header("X-Goog-Upload-Protocol", "resumable")
                .header("X-Goog-Upload-Command", "start")
                .header("X-Goog-Upload-Header-Content-Length", String.valueOf(Files.size(media.path())))
                .header("X-Goog-Upload-Header-Content-Type", media.mimeType())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("file", Map.of("display_name", "yeogidam-media")))
                .retrieve()
                .toEntity(JsonNode.class);
        String location = response.getHeaders().getFirst("X-Goog-Upload-URL");
        URI uri = URI.create(location);
        if (!baseUri.getScheme().equals(uri.getScheme()) || !baseUri.getAuthority().equals(uri.getAuthority())) {
            throw new IllegalStateException("Gemini 업로드 URL이 일치하지 않습니다.");
        }
        return uri;
    }

    /** PROCESSING 동안 대기하며 상태를 조회하고, ACTIVE 외의 최종 상태는 실패로 처리한다. */
    private JsonNode awaitActive(
            JsonNode file,
            String name,
            String apiKey,
            ExtractionReport report
    ) throws InterruptedException {
        report.enterStage("GEMINI_FILE_PROCESSING");
        long deadline = System.nanoTime() + processingTimeout.toNanos();
        while ("PROCESSING".equals(file.path("state").asString())) {
            // 조회를 시작하기 전에 대기 기한을 확인하므로, 진행 중인 HTTP 요청이 기한을 넘길 수 있다.
            if (System.nanoTime() >= deadline) {
                throw new IllegalStateException("Gemini 파일 처리 대기 시간이 초과되었습니다.");
            }
            Thread.sleep(POLL_MILLIS);
            file = restClient.get()
                .uri(baseUri.resolve("/v1beta/" + name))
                    .header("x-goog-api-key", apiKey)
                    .retrieve()
                .body(JsonNode.class);
            if (file == null) {
                throw new IllegalStateException("Gemini 파일 상태 응답이 없습니다.");
            }
        }
        if (!"ACTIVE".equals(file.path("state").asString())) {
            throw new IllegalStateException("Gemini 파일 처리가 실패했습니다.");
        }
        return file;
    }

    private void validateName(String name) {
        if (name == null || !name.matches("files/[A-Za-z0-9_-]+")) {
            throw new IllegalStateException("Gemini 파일 이름이 올바르지 않습니다.");
        }
    }

    /**
     * Gemini에 업로드한 파일의 삭제를 시도한다.
     * 삭제 실패는 경고 로그로 남기며, 호출자의 분석 결과나 원래 예외를 덮어쓰지 않는다.
     *
     * @param name 업로드 응답에서 받은 files/식별자 형식의 파일 이름
     * @param apiKey 파일을 올릴 때 쓴 Gemini key
     */
    public void delete(String name, String apiKey) {
        try {
            validateName(name);
            restClient.delete()
                    .uri(baseUri.resolve("/v1beta/" + name))
                    .header("x-goog-api-key", apiKey)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RuntimeException exception) {
            log.warn("Gemini 분석용 업로드 파일 삭제에 실패했습니다.");
        }
    }
}
