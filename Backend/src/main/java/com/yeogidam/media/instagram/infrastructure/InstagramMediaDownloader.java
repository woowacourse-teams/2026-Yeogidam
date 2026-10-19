package com.yeogidam.media.instagram.infrastructure;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.DownloadedMedia;
import com.yeogidam.media.instagram.domain.InstagramMediaSource;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 인스타그램 이미지와 영상 원본을 분석용 임시 파일로 내려받고, 사용이 끝난 파일을 정리한다. */
@Slf4j
@Component
public class InstagramMediaDownloader {

    // 파일 전체를 메모리에 올리지 않고 한 번에 8KiB씩 읽어 임시 파일에 저장한다.
    private static final int BUFFER_BYTES = 8192;

    private final InstagramMediaSourceReader sourceReader;
    private final RestClient restClient;

    public InstagramMediaDownloader(
            InstagramMediaSourceReader sourceReader,
            @Qualifier("instagramMediaRestClient") RestClient restClient
    ) {
        this.sourceReader = sourceReader;
        this.restClient = restClient;
    }

    /**
     * 공유받은 인스타그램 게시물의 이미지와 영상 원본을 임시 파일로 다운로드한다.
     *
     * <p>먼저 InstagramMediaSourceReader가 게시물에서 원본 URL과 유형(image 또는 video)을 조회한다.
     * 원본 목록이 비어 있으면 실패 처리하고, /reel/ 경로는 영상 원본 하나가 있는지 확인한다.
     * 캐러셀은 조회된 원본 순서대로 파일을 하나씩 내려받으며, 일부 파일만 성공 결과로 반환하지 않는다.
     *
     * <p>각 원본 URL이 허용된 인스타그램 CDN의 HTTPS 주소인지 확인한 뒤 GET 요청을 보낸다.
     * 응답 상태가 성공이고 Content-Type이 원본 유형과 일치할 때 응답 본문을 임시 파일에 저장한다.
     * 본문은 8KiB씩 복사하며, 파일이 비어 있으면 실패 처리한다.
     * 반환하는 DownloadedMedia에는 로컬 파일 경로와 MIME 유형이 담긴다.
     *
     * <p>다운로드 도중 실패하면 이미 내려받은 파일의 삭제를 시도하고 PROCESSING_FAILED로 전달한다.
     * 성공한 파일은 호출자가 사용을 마친 뒤 delete로 정리해야 한다.
     * 현재 GeminiPlaceNameExtractor가 업로드와 분석을 수행하고 finally에서 파일을 정리한다.
     * 이 클래스는 Gemini 업로드나 장소 분석을 수행하지 않는다.
     *
     * @param url 원본을 다운로드할 인스타그램 게시물의 공유 URL
     * @return 게시물 순서로 정리한 임시 파일 경로와 MIME 유형의 목록
     * @throws ExtractionFailedException 원본 조회, 검증 또는 다운로드에 실패한 경우
     */
    public List<DownloadedMedia> download(InstagramUrl url) {
        // 이후 파일 다운로드가 실패하면 앞서 완료한 파일도 정리할 수 있도록 목록을 유지한다.
        List<DownloadedMedia> downloaded = new ArrayList<>();

        try {
            List<InstagramMediaSource> sources = sourceReader.read(url);
            validateSources(sources, url);
            for (InstagramMediaSource source : sources) {
                DownloadedMedia file = download(source);
                downloaded.add(file);
            }
            return List.copyOf(downloaded);
        } catch (IOException | RuntimeException exception) {
            delete(downloaded);
            throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED, exception);
        }
    }

    private void validateSources(List<InstagramMediaSource> sources, InstagramUrl url) {
        if (sources.isEmpty()) {
            throw new IllegalArgumentException("분석할 미디어 원본이 없습니다.");
        }
        if (url.isReel() && (sources.size() != 1 || !sources.getFirst().isVideo())) {
            throw new IllegalArgumentException("릴스 영상 원본을 찾지 못했습니다.");
        }
    }

    private DownloadedMedia download(InstagramMediaSource source) throws IOException {
        validateUri(source.uri());
        // 확장자는 임시 저장용이며, Gemini에 전달할 실제 파일 유형은 응답의 Content-Type을 사용한다.
        Path path = Files.createTempFile("yeogidam-media-", ".bin");
        try {
            return restClient.get()
                .uri(source.uri()).exchange((request, response) -> {
                if (!response.getStatusCode().is2xxSuccessful()) {
                    throw new IOException("미디어 다운로드 요청에 실패했습니다.");
                }
                String mimeType = response.getHeaders().getFirst("Content-Type");
                validateMimeType(mimeType, source.type());
                try (InputStream input = response.getBody(); OutputStream output = Files.newOutputStream(path)) {
                    copy(input, output);
                }
                return new DownloadedMedia(path, mimeType.split(";", 2)[0].strip());
            });
        } catch (RuntimeException exception) {
            // 아직 완료 목록에 들어가지 않은 현재 파일은 여기서 정리한다.
            delete(path);
            throw exception;
        }
    }

    private void validateUri(URI uri) {
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null || uri.getUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)
                || (!host.endsWith(".cdninstagram.com") && !host.endsWith(".fbcdn.net"))) {
            throw new IllegalArgumentException("인스타그램 CDN 원본 URL이 아닙니다.");
        }
    }

    private void validateMimeType(String mimeType, String type) {
        if (mimeType == null || !mimeType.startsWith(type + "/")) {
            throw new IllegalArgumentException("미디어 유형이 일치하지 않습니다.");
        }
    }

    private void copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[BUFFER_BYTES];
        long total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            output.write(buffer, 0, count);
        }
        if (total == 0) {
            throw new IOException("미디어 원본 파일이 비어 있습니다.");
        }
    }

    /**
     * 사용이 끝난 분석용 임시 파일의 삭제를 시도한다.
     * 이미 삭제된 파일은 건너뛰고, 삭제 중 IOException이 발생하면 경고 로그를 남기고 다음 파일을 정리한다.
     *
     * @param files 정리할 임시 파일 목록
     */
    public void delete(List<DownloadedMedia> files) {
        for (DownloadedMedia file : files) {
            delete(file.path());
        }
    }

    private void delete(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException exception) {
            log.warn("분석용 임시 미디어 파일 삭제에 실패했습니다.");
        }
    }
}
