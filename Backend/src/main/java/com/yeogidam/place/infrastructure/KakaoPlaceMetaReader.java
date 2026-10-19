package com.yeogidam.place.infrastructure;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/** 카카오 장소 공개 페이지의 이미지 메타 태그에서 대표 사진 주소를 읽는다. */
@Component
@Slf4j
public class KakaoPlaceMetaReader {

    private static final URI PLACE_PAGE_BASE_URI = URI.create("https://place.map.kakao.com/");
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private static final String USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    private static final int MAX_RESPONSE_SIZE_BYTES = 1_000_000;
    private static final int MAX_REDIRECTS = 3;
    private static final Set<String> PLACE_PAGE_HOSTS = Set.of(
            "place.map.kakao.com",
            "map.kakao.com",
            "m.map.kakao.com"
    );
    private static final List<String> IMAGE_META_TAGS = List.of(
            "og:image",
            "og:image:secure_url",
            "og:image:url",
            "twitter:image",
            "twitter:image:src"
    );
    private static final Pattern META_TAG = Pattern.compile("<meta\\b([^>]*)>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTRIBUTE = Pattern.compile(
            "([a-zA-Z_:][a-zA-Z0-9_:.-]*)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
            Pattern.CASE_INSENSITIVE
    );

    private final HttpClient httpClient;

    public KakaoPlaceMetaReader(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public String readMainPhotoUrl(String placeId) {
        if (!isValidPlaceId(placeId)) {
            log.warn("장소 페이지 식별자를 사용할 수 없습니다.");
            return null;
        }
        URI pageUri = PLACE_PAGE_BASE_URI.resolve(placeId);
        HttpResponse<InputStream> response = send(pageUri, placeId);
        if (response == null) {
            return null;
        }
        String html = readHtml(response, placeId);
        if (html == null) {
            return null;
        }
        return findMainPhotoUrl(response.uri(), html);
    }

    private boolean isValidPlaceId(String placeId) {
        return placeId != null && placeId.matches("[0-9]{1,20}");
    }

    private HttpResponse<InputStream> send(URI pageUri, String placeId) {
        try {
            return sendPage(pageUri, 0, placeId);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("카카오 장소 페이지 요청이 중단되었습니다.", exception);
        }
    }

    private HttpResponse<InputStream> sendPage(URI pageUri, int redirectCount, String placeId)
            throws InterruptedException {
        HttpResponse<InputStream> response;
        try {
            response = sendRequest(pageUri);
        } catch (IOException exception) {
            log.warn("장소 페이지 요청에 실패했습니다. placeId={}, exceptionType={}",
                    placeId, exception.getClass().getSimpleName());
            return null;
        }
        if (!isRedirect(response.statusCode())) {
            return response;
        }
        URI nextPageUri;
        try (InputStream ignored = response.body()) {
            if (redirectCount >= MAX_REDIRECTS) {
                log.warn("장소 페이지 리다이렉트 횟수가 너무 많습니다. placeId={}", placeId);
                return null;
            }
            String location = response.headers().firstValue("Location").orElse(null);
            if (location == null || location.isBlank()) {
                log.warn("장소 페이지 리다이렉트 주소가 없습니다. placeId={}", placeId);
                return null;
            }
            nextPageUri = nextPageUriOrNull(pageUri, location, placeId);
            if (nextPageUri == null) {
                return null;
            }
        } catch (IOException exception) {
            log.warn("장소 페이지 리다이렉트 응답을 닫지 못했습니다. placeId={}, exceptionType={}",
                    placeId, exception.getClass().getSimpleName());
            return null;
        }
        return sendPage(nextPageUri, redirectCount + 1, placeId);
    }

    private HttpResponse<InputStream> sendRequest(URI pageUri) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(pageUri)
                .timeout(REQUEST_TIMEOUT)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "text/html,application/xhtml+xml")
                .header("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7")
                .GET()
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
    }

    private URI nextPageUriOrNull(URI currentUri, String location, String placeId) {
        try {
            return validatePageUri(currentUri.resolve(location), placeId);
        } catch (IllegalArgumentException exception) {
            log.warn("장소 페이지 리다이렉트 주소를 사용할 수 없습니다. placeId={}", placeId);
            return null;
        }
    }

    private URI validatePageUri(URI pageUri, String placeId) {
        String host = pageUri.getHost();
        if (!"https".equalsIgnoreCase(pageUri.getScheme()) || host == null
                || !PLACE_PAGE_HOSTS.contains(host.toLowerCase(Locale.ROOT))
                || pageUri.getUserInfo() != null
                || (pageUri.getPort() != -1 && pageUri.getPort() != 443)) {
            log.warn("허용되지 않은 장소 페이지 리다이렉트 주소입니다. placeId={}", placeId);
            return null;
        }
        return pageUri;
    }

    private boolean isRedirect(int statusCode) {
        return statusCode == 301 || statusCode == 302 || statusCode == 303
                || statusCode == 307 || statusCode == 308;
    }

    private String findMainPhotoUrl(URI pageUri, String html) {
        Map<String, String> metaTags = readMetaTags(html);
        return firstImageUrl(pageUri, metaTags);
    }

    private String firstImageUrl(URI pageUri, Map<String, String> metaTags) {
        for (String metaTag : IMAGE_META_TAGS) {
            String imageUrl = secureImageUrl(pageUri, metaTags.get(metaTag));
            if (imageUrl != null) {
                return imageUrl;
            }
        }
        return null;
    }

    private String readHtml(HttpResponse<InputStream> response, String placeId) {
        try (InputStream body = response.body()) {
            if (!isUsableResponse(response, placeId)) {
                return null;
            }
            byte[] bytes = body.readNBytes(MAX_RESPONSE_SIZE_BYTES + 1);
            if (bytes.length > MAX_RESPONSE_SIZE_BYTES) {
                log.warn("장소 페이지 응답 크기가 제한을 초과했습니다. placeId={}", placeId);
                return null;
            }
            return new String(bytes, StandardCharsets.UTF_8);
        } catch (IOException exception) {
            log.warn("장소 페이지 응답을 읽지 못했습니다. placeId={}, exceptionType={}",
                    placeId, exception.getClass().getSimpleName());
            return null;
        }
    }

    private boolean isUsableResponse(HttpResponse<?> response, String placeId) {
        String contentType = response.headers()
                .firstValue("Content-Type")
                .orElse("")
                .toLowerCase(Locale.ROOT);
        if (response.statusCode() != 200 || !isHtml(contentType)) {
            log.warn("장소 페이지 응답 상태가 올바르지 않습니다. placeId={}, status={}",
                    placeId, response.statusCode());
            return false;
        }
        return true;
    }

    private boolean isHtml(String contentType) {
        return contentType.contains("text/html")
                || contentType.contains("application/xhtml+xml");
    }

    private Map<String, String> readMetaTags(String html) {
        Map<String, String> metaTags = new HashMap<>();
        Matcher tags = META_TAG.matcher(html);
        while (tags.find()) {
            addMetaTag(metaTags, tags.group(1));
        }
        return metaTags;
    }

    private void addMetaTag(Map<String, String> metaTags, String attributesText) {
        Map<String, String> attributes = readAttributes(attributesText);
        String name = attributes.getOrDefault("property", attributes.get("name"));
        String content = attributes.get("content");
        if (name != null && content != null) {
            metaTags.putIfAbsent(name.toLowerCase(Locale.ROOT), HtmlUtils.htmlUnescape(content).strip());
        }
    }

    private Map<String, String> readAttributes(String attributesText) {
        Map<String, String> attributes = new HashMap<>();
        Matcher values = ATTRIBUTE.matcher(attributesText);
        while (values.find()) {
            attributes.put(values.group(1).toLowerCase(Locale.ROOT), attributeValue(values));
        }
        return attributes;
    }

    private String attributeValue(Matcher matcher) {
        if (matcher.group(2) != null) {
            return matcher.group(2);
        }
        if (matcher.group(3) != null) {
            return matcher.group(3);
        }
        return matcher.group(4);
    }

    private String secureImageUrl(URI pageUri, String value) {
        if (!hasImageUrl(value)) {
            return null;
        }
        try {
            return secureUri(pageUri.resolve(value.strip()));
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    private boolean hasImageUrl(String value) {
        return value != null && !value.isBlank();
    }

    private boolean isAllowedImageUri(URI uri) {
        return isHttp(uri)
                && uri.getHost() != null
                && uri.getUserInfo() == null
                && isDefaultPort(uri);
    }

    private boolean isHttp(URI uri) {
        return "http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme());
    }

    private boolean isDefaultPort(URI uri) {
        return uri.getPort() == -1 || uri.getPort() == 80 || uri.getPort() == 443;
    }

    private String secureUri(URI uri) {
        if (!isAllowedImageUri(uri)) {
            return null;
        }
        String path = uriPath(uri);
        String query = uriQuery(uri);
        return "https://" + uri.getHost() + path + query;
    }

    private String uriPath(URI uri) {
        return uri.getRawPath() == null ? "" : uri.getRawPath();
    }

    private String uriQuery(URI uri) {
        return uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
    }
}
