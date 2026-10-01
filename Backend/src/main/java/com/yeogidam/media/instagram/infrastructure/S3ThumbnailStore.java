package com.yeogidam.media.instagram.infrastructure;

import com.yeogidam.media.instagram.config.ThumbnailProperties;
import com.yeogidam.media.instagram.domain.MediaShortcode;
import com.yeogidam.place.service.PlaceThumbnailStore;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/*
인스타그램 썸네일과 카카오 장소 사진을 다운로드해 검증 및 처리한 뒤 S3에 저장하고, 저장 키를 반환합니다.
 */
@Component
@Slf4j
public class S3ThumbnailStore implements InstagramThumbnailStore, PlaceThumbnailStore {

    private static final int MAX_THUMBNAIL_SIZE_BYTES = 5 * 1024 * 1024;
    private static final int MAX_REDIRECTS = 3;
    private static final int MIN_PLACE_IMAGE_LONG_EDGE = 400;
    private static final int NO_MINIMUM_IMAGE_LONG_EDGE = 0;
    private static final String USER_AGENT = "Yeogidam/1.0";

    private final S3Client s3Client;
    private final HttpClient httpClient;
    private final ThumbnailProperties properties;
    private final ThumbnailImageProcessor imageProcessor;

    S3ThumbnailStore(S3Client s3Client, HttpClient httpClient, ThumbnailProperties properties,
                     ThumbnailImageProcessor imageProcessor) {
        this.s3Client = s3Client;
        this.httpClient = httpClient;
        this.properties = properties;
        this.imageProcessor = imageProcessor;
    }

    @Override
    // 인스타그램 게시물 shortcode를 식별자로 쓰고, 인스타그램 CDN 주소만 허용
    public String store(MediaShortcode shortcode, String sourceUrl) {
        return store(sourceUrl, ThumbnailOrigin.INSTAGRAM, shortcode.value());
    }

    @Override
    // 카카오 장소 ID가 영문·숫자·_·-로 된 1~64자인지 먼저 확인한 뒤 카카오 출처로 저장
    public String store(String kakaoPlaceId, String sourceUrl) {
        if (kakaoPlaceId == null || !kakaoPlaceId.matches("[A-Za-z0-9_-]{1,64}")) {
            log.warn("장소 썸네일 식별자를 사용할 수 없습니다. origin=KAKAO");
            return null;
        }
        return store(sourceUrl, ThumbnailOrigin.KAKAO, kakaoPlaceId);
    }

    private String store(String sourceUrl, ThumbnailOrigin origin, String identifier) {
        URI sourceUri = sourceUriOrNull(sourceUrl, origin, identifier);
        if (sourceUri == null) {
            return null;
        }
        DownloadedThumbnail thumbnail = download(sourceUri, origin, identifier);
        if (thumbnail == null) {
            return null;
        }
        String key = createKey(identifier, thumbnail.extension(), origin);
        if (!upload(key, thumbnail, origin, identifier)) {
            return null;
        }
        return key;
    }

    private URI sourceUriOrNull(String sourceUrl, ThumbnailOrigin origin, String identifier) {
        if (sourceUrl == null || sourceUrl.isBlank()) {
            log.warn("썸네일 주소가 비어 있습니다. origin={}, id={}", origin, identifier);
            return null;
        }
        URI uri;
        try {
            uri = URI.create(sourceUrl);
        } catch (IllegalArgumentException exception) {
            log.warn("썸네일 주소를 사용할 수 없습니다. origin={}, id={}", origin, identifier);
            return null;
        }
        return allowedSourceUri(uri, origin, identifier);
    }

    private URI allowedSourceUri(URI uri, ThumbnailOrigin origin, String identifier) {
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !origin.isAllowedHost(uri.getHost())
                || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) {
            log.warn("허용되지 않은 썸네일 주소입니다. origin={}, id={}", origin, identifier);
            return null;
        }
        return uri;
    }

    private static boolean isInstagramCdn(String host) {
        if (host == null) {
            return false;
        }
        String normalizedHost = host.toLowerCase(Locale.ROOT);
        return normalizedHost.equals("cdninstagram.com")
                || normalizedHost.endsWith(".cdninstagram.com")
                || normalizedHost.equals("fbcdn.net")
                || normalizedHost.endsWith(".fbcdn.net");
    }

    private DownloadedThumbnail download(URI sourceUri, ThumbnailOrigin origin, String identifier) {
        try {
            URI currentUri = sourceUri;
            for (int redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
                HttpResponse<InputStream> response = send(currentUri);
                if (!isRedirect(response.statusCode())) {
                    return readThumbnail(response, origin, identifier);
                }
                try (InputStream ignored = response.body()) {
                    if (redirectCount == MAX_REDIRECTS) {
                        log.warn("썸네일 리다이렉트 횟수가 너무 많습니다. origin={}, id={}", origin, identifier);
                        return null;
                    }
                    String location = response.headers().firstValue("Location").orElse(null);
                    if (location == null || location.isBlank()) {
                        log.warn("썸네일 리다이렉트 주소가 없습니다. origin={}, id={}", origin, identifier);
                        return null;
                    }
                    URI redirectedUri = redirectedUriOrNull(currentUri, location, origin, identifier);
                    if (redirectedUri == null) {
                        return null;
                    }
                    currentUri = redirectedUri;
                }
            }
            log.warn("썸네일 다운로드를 마치지 못했습니다. origin={}, id={}", origin, identifier);
            return null;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("썸네일 다운로드가 중단되었습니다.", exception);
        } catch (IOException exception) {
            log.warn("썸네일 다운로드에 실패했습니다. origin={}, id={}, exceptionType={}",
                    origin, identifier, exception.getClass().getSimpleName());
            return null;
        }
    }

    private URI redirectedUriOrNull(URI currentUri, String location, ThumbnailOrigin origin, String identifier) {
        try {
            return allowedSourceUri(currentUri.resolve(location), origin, identifier);
        } catch (IllegalArgumentException exception) {
            log.warn("썸네일 리다이렉트 주소를 사용할 수 없습니다. origin={}, id={}", origin, identifier);
            return null;
        }
    }

    private HttpResponse<InputStream> send(URI sourceUri) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(sourceUri)
                .timeout(Duration.ofSeconds(15))
                .header("User-Agent", USER_AGENT)
                .header("Accept", "image/jpeg,image/png,image/webp,image/avif")
                .GET()
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
    }

    private boolean isRedirect(int statusCode) {
        return statusCode == 301 || statusCode == 302 || statusCode == 303 || statusCode == 307 || statusCode == 308;
    }

    private DownloadedThumbnail readThumbnail(
            HttpResponse<InputStream> response,
            ThumbnailOrigin origin,
            String identifier
    )
            throws IOException {
        try (InputStream body = response.body()) {
            if (!isUsableResponse(response, origin, identifier)) {
                return null;
            }
            byte[] bytes = body.readNBytes(MAX_THUMBNAIL_SIZE_BYTES + 1);
            if (bytes.length == 0) {
                log.warn("썸네일 응답이 비어 있습니다. origin={}, id={}", origin, identifier);
                return null;
            }
            if (bytes.length > MAX_THUMBNAIL_SIZE_BYTES) {
                log.warn("썸네일 응답 크기가 제한을 초과했습니다. origin={}, id={}", origin, identifier);
                return null;
            }
            ImageType imageType = ImageType.fromContentType(response.headers().firstValue("Content-Type").orElse(""));
            if (imageType == null) {
                log.warn("지원하지 않는 썸네일 형식입니다. origin={}, id={}", origin, identifier);
                return null;
            }
            ThumbnailImageProcessor.ProcessedThumbnail processed = imageProcessor.process(
                    bytes, imageType.contentType(), imageType.extension(), origin.minimumLongEdge());
            if (processed == null) {
                log.warn("썸네일 해상도가 저장 기준보다 낮습니다. origin={}, id={}", origin, identifier);
                return null;
            }
            return new DownloadedThumbnail(processed.bytes(), processed.contentType(), processed.extension());
        }
    }

    private boolean isUsableResponse(HttpResponse<InputStream> response, ThumbnailOrigin origin, String identifier) {
        if (response.statusCode() != 200) {
            log.warn("썸네일 응답 상태가 올바르지 않습니다. origin={}, id={}, status={}",
                    origin, identifier, response.statusCode());
            return false;
        }
        long contentLength;
        try {
            contentLength = response.headers().firstValueAsLong("Content-Length").orElse(-1L);
        } catch (NumberFormatException exception) {
            log.warn("썸네일 응답 크기를 확인할 수 없습니다. origin={}, id={}", origin, identifier);
            return false;
        }
        if (contentLength > MAX_THUMBNAIL_SIZE_BYTES) {
            log.warn("썸네일 응답 크기가 제한을 초과했습니다. origin={}, id={}", origin, identifier);
            return false;
        }
        return true;
    }

    private String createKey(String identifier, String extension, ThumbnailOrigin origin) {
        String configuredPrefix = origin == ThumbnailOrigin.KAKAO
                ? properties.placeKeyPrefix()
                : properties.instagramKeyPrefix();
        String prefix = configuredPrefix.replaceAll("^/+|/+$", "");
        return prefix + "/" + identifier + extension;
    }

    private boolean upload(String key, DownloadedThumbnail thumbnail, ThumbnailOrigin origin, String identifier) {
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(properties.bucket())
                .key(key)
                .contentType(thumbnail.contentType())
                .build();
        try {
            s3Client.putObject(request, RequestBody.fromBytes(thumbnail.bytes()));
            return true;
        } catch (SdkException exception) {
            log.warn("썸네일 저장소 업로드에 실패했습니다. origin={}, id={}, exceptionType={}",
                    origin, identifier, exception.getClass().getSimpleName());
            return false;
        }
    }

    private enum ImageType {
        JPEG("image/jpeg", ".jpg"),
        PNG("image/png", ".png"),
        WEBP("image/webp", ".webp"),
        AVIF("image/avif", ".avif");

        private final String contentType;
        private final String extension;

        ImageType(String contentType, String extension) {
            this.contentType = contentType;
            this.extension = extension;
        }

        private static ImageType fromContentType(String contentType) {
            String normalizedType = contentType.split(";", 2)[0].strip().toLowerCase(Locale.ROOT);
            for (ImageType imageType : values()) {
                if (imageType.contentType.equals(normalizedType)) {
                    return imageType;
                }
            }
            return null;
        }

        private String contentType() {
            return contentType;
        }

        private String extension() {
            return extension;
        }
    }

    private record DownloadedThumbnail(byte[] bytes, String contentType, String extension) {
    }

    private enum ThumbnailOrigin {
        INSTAGRAM(NO_MINIMUM_IMAGE_LONG_EDGE) {
            @Override
            boolean isAllowedHost(String host) {
                return isInstagramCdn(host);
            }
        },
        KAKAO(MIN_PLACE_IMAGE_LONG_EDGE) {
            @Override
            boolean isAllowedHost(String host) {
                return isKakaoCdn(host);
            }
        };

        private final int minimumLongEdge;

        ThumbnailOrigin(int minimumLongEdge) {
            this.minimumLongEdge = minimumLongEdge;
        }

        abstract boolean isAllowedHost(String host);

        int minimumLongEdge() {
            return minimumLongEdge;
        }
    }

    static boolean isKakaoCdn(String host) {
        if (host == null) {
            return false;
        }
        String normalizedHost = host.toLowerCase(Locale.ROOT);
        return belongsTo(normalizedHost, "kakao.com")
                || belongsTo(normalizedHost, "kakaocdn.net")
                || belongsTo(normalizedHost, "daumcdn.net")
                || normalizedHost.equals("postfiles.pstatic.net");
    }

    private static boolean belongsTo(String host, String domain) {
        return host.equals(domain) || host.endsWith("." + domain);
    }
}
