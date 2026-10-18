package com.yeogidam.media.instagram.infrastructure;

import com.yeogidam.media.extraction.domain.ExtractionFailureReason;
import com.yeogidam.media.extraction.exception.ExtractionFailedException;
import com.yeogidam.media.instagram.domain.InstagramMediaSource;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import java.math.BigInteger;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 공개 페이지의 포함 데이터에서 대상 게시물의 전체 원본 목록을 읽는다. */
@Component
public class InstagramMediaSourceReader {

    private static final Pattern SCRIPTS = Pattern.compile("<script\\b[^>]*>(.*?)</script>", Pattern.DOTALL);
    private static final int MAX_DEPTH = 80;
    private static final Pattern PUBLIC_REQUEST_TOKEN = Pattern.compile("\\[\"LSD\",\\[\\],\\{\"token\":\"([^\"]+)\"");
    private static final String MEDIA_QUERY_DOCUMENT = "27130156389949648";
    private static final String SHORTCODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    private final RestClient restClient;
    private final JsonMapper jsonMapper;

    public InstagramMediaSourceReader(
            @Qualifier("instagramMediaRestClient") RestClient restClient,
            JsonMapper jsonMapper
    ) {
        this.restClient = restClient;
        this.jsonMapper = jsonMapper;
    }

    /**
     * 공유받은 인스타그램 게시물에서 이미지와 영상 원본의 주소 및 유형을 조회한다.
     *
     * <p>먼저 게시물을 외부 페이지에 표시하기 위한 /embed/ 페이지를 요청한다.
     * 응답은 영상 파일 자체가 아니라 HTML이며, 그 안의 script에 포함된 게시물 JSON 데이터에서
     * 공유 URL의 shortcode(게시물을 구분하는 문자열)와 일치하는 게시물을 찾는다.
     * 해당 게시물의 이미지 또는 영상 URL을 얻으면 추가 조회 없이 반환한다.
     * 릴스는 영상 원본 하나가 필요하므로 썸네일만 얻은 경우 다음 조회 경로를 진행한다.
     *
     * <p>포함용 페이지에서 원본을 얻지 못하면 일반 게시물 페이지를 조회한다.
     * 일반 페이지의 게시물 데이터에도 원본이 없으면, HTML에서 요청 토큰을 찾을 수 있을 때
     * 로그인 쿠키 없이 공개 GraphQL 조회를 시도한다. 이 두 번째 조회 경로는 readPublicMedia가 담당한다.
     *
     * <p>여러 항목이 있는 캐러셀 게시물은 게시물 데이터의 순서대로 원본 목록을 만든다.
     * 캐러셀 원본이 누락된 경우 대표 썸네일이나 일부 항목만으로 대체하지 않는다.
     * 두 조회 경로 모두 원본을 확보하지 못하면 미디어 분석을 진행할 수 없으므로 실패 처리한다.
     * 실제 파일 다운로드와 Gemini 업로드 및 분석은 이 메서드가 아닌 후속 처리에서 수행한다.
     *
     * @param url 원본을 조회할 인스타그램 게시물의 공유 URL
     * @return 게시물 순서로 정리한 원본 주소와 미디어 유형(image 또는 video)의 목록
     * @throws ExtractionFailedException 두 조회 경로를 거쳐도 원본 목록을 확보하지 못한 경우
     */
    public List<InstagramMediaSource> read(InstagramUrl url) {
        // 경로 끝의 슬래시 하나를 제거해 아래에서 /embed/ 또는 /를 붙일 때 중복되지 않도록 한다.
        String path = URI.create(url.getSharedUrl().strip())
                .getPath()
                .replaceFirst("/$", "");
        String canonical = "https://www.instagram.com" + path;

        // 1차 조회: /p/ABC/embed/ 등의 포함용 페이지에서 대상 게시물의 원본 주소를 찾는다.
        List<InstagramMediaSource> sources = readPage(canonical + "/embed/", url.getMediaShortcode().value());
        if (hasRequiredSources(sources, url)) {
            return sources;
        }
        // 2차 조회: 일반 게시물 페이지를 해석하고, 원본이 없으면 요청 토큰을 이용한 공개 조회를 시도한다.
        sources = readPublicMedia(canonical + "/", url);
        if (!hasRequiredSources(sources, url)) {
            throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED);
        }
        return sources;
    }

    private boolean hasRequiredSources(List<InstagramMediaSource> sources, InstagramUrl url) {
        if (sources.isEmpty()) {
            return false;
        }
        if (url.isReel()) {
            return sources.size() == 1 && sources.getFirst().isVideo();
        }
        return true;
    }

    private List<InstagramMediaSource> readPage(String pageUrl, String shortcode) {
        try {
            return parse(fetchPage(pageUrl), shortcode);
        } catch (RestClientException | ExtractionFailedException exception) {
            return List.of();
        }
    }

    private String fetchPage(String pageUrl) {
        return restClient.get()
                .uri(pageUrl)
                .header("User-Agent", "Mozilla/5.0")
                .header("Accept-Language", "ko,en;q=0.9")
                .retrieve()
                .body(String.class);
    }

    private List<InstagramMediaSource> readPublicMedia(String pageUrl, InstagramUrl url) {
        try {
            String html = fetchPage(pageUrl);
            String shortcode = url.getMediaShortcode().value();
            List<InstagramMediaSource> sources = parsePageOrEmpty(html, shortcode);
            if (hasRequiredSources(sources, url)) {
                return sources;
            }
            return readPublicQuery(html, pageUrl, shortcode);
        } catch (RestClientException | ExtractionFailedException exception) {
            return List.of();
        }
    }

    private List<InstagramMediaSource> parsePageOrEmpty(String html, String shortcode) {
        try {
            return parse(html, shortcode);
        } catch (ExtractionFailedException exception) {
            return List.of();
        }
    }

    private List<InstagramMediaSource> readPublicQuery(String html, String pageUrl, String shortcode) {
        if (html == null) {
            return List.of();
        }
        Matcher token = PUBLIC_REQUEST_TOKEN.matcher(html);
        if (!token.find()) {
            return List.of();
        }
        var form = publicQuery(shortcode, token.group(1));
        String response = restClient.post()
                .uri("https://www.instagram.com/api/graphql")
                .header("User-Agent", "Mozilla/5.0")
                .header("X-FB-LSD", token.group(1))
                .header("X-IG-App-ID", "936619743392459")
                .header("Referer", pageUrl)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form).retrieve()
                .body(String.class);
        JsonNode post = findPost(readJson(response), shortcode, 0);
        if (post == null) {
            return List.of();
        }
        return sources(post);
    }

    private LinkedMultiValueMap<String, String> publicQuery(String shortcode, String token) {
        var form = new LinkedMultiValueMap<String, String>();
        form.add("lsd", token);
        form.add("fb_api_caller_class", "RelayModern");
        form.add("fb_api_req_friendly_name", "PolarisLoggedOutDesktopWWWPostRootContentQuery");
        form.add("server_timestamps", "true");
        form.add("variables",
                jsonMapper.writeValueAsString(java.util.Map.of("media_id", mediaId(shortcode))));
        form.add("doc_id", MEDIA_QUERY_DOCUMENT);
        return form;
    }

    private String mediaId(String shortcode) {
        BigInteger value = BigInteger.ZERO;
        for (char character : shortcode.toCharArray()) {
            value = value.multiply(BigInteger.valueOf(64))
                    .add(BigInteger.valueOf(SHORTCODE_ALPHABET.indexOf(character)));
        }
        return value.toString();
    }

    private List<InstagramMediaSource> parse(String html, String shortcode) {
        if (html == null) {
            return List.of();
        }
        Matcher scripts = SCRIPTS.matcher(html);
        while (scripts.find()) {
            JsonNode post = findPost(readScript(scripts.group(1)), shortcode, 0);
            if (post != null) {
                return sources(post);
            }
        }
        return List.of();
    }

    private JsonNode readScript(String script) {
        String candidate = script.strip();
        if (candidate.startsWith("{")) {
            return readJson(candidate);
        }
        int handle = script.indexOf(".handle(");
        if (handle < 0) {
            return null;
        }
        int start = script.indexOf('{', handle);
        if (start < 0) {
            return null;
        }
        return readJson(jsonObject(script, start));
    }

    private String jsonObject(String text, int start) {
        int depth = 0;
        boolean quoted = false;
        boolean escaped = false;
        for (int index = Math.max(start, 0); index < text.length(); index++) {
            char character = text.charAt(index);
            if (escaped) {
                escaped = false;
                continue;
            }
            if (quoted && character == '\\') {
                escaped = true;
                continue;
            }
            if (character == '"') {
                quoted = !quoted;
            }
            if (!quoted && character == '{') {
                depth++;
            }
            if (!quoted && character == '}' && --depth == 0) {
                return text.substring(start, index + 1);
            }
        }
        return "";
    }

    private JsonNode readJson(String text) {
        try {
            return jsonMapper.readTree(text);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private JsonNode findPost(
            JsonNode node,
            String shortcode,
            int depth
    ) {
        if (node == null || depth > MAX_DEPTH) {
            return null;
        }
        boolean matches = shortcode.equals(node.path("shortcode").asString())
                || shortcode.equals(node.path("code").asString());
        if (matches && (node.has("display_url") || node.has("image_versions2") || node.has("video_versions")
                || node.has("edge_sidecar_to_children") || node.has("carousel_media"))) {
            return node;
        }
        if (node.isString()) {
            return findPost(readJson(node.asString()), shortcode, depth + 1);
        }
        for (JsonNode child : node) {
            JsonNode post = findPost(child, shortcode, depth + 1);
            if (post != null) {
                return post;
            }
        }
        return null;
    }

    private List<InstagramMediaSource> sources(JsonNode post) {
        List<InstagramMediaSource> sources = new ArrayList<>();
        JsonNode edges = post.path("edge_sidecar_to_children").path("edges");
        if (edges.isArray()) {
            for (JsonNode edge : edges) {
                sources.add(source(edge.path("node")));
            }
            return List.copyOf(sources);
        }
        JsonNode carousel = post.path("carousel_media");
        if (carousel.isArray()) {
            for (JsonNode item : carousel) {
                sources.add(source(item));
            }
            return List.copyOf(sources);
        }
        if ("GraphSidecar".equals(post.path("__typename").asString()) || post.path("media_type").asInt() == 8) {
            throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED);
        }
        return List.of(source(post));
    }

    private InstagramMediaSource source(JsonNode media) {
        if (media.path("is_video").asBoolean() || media.path("media_type").asInt() == 2
                || "GraphVideo".equals(media.path("__typename").asString())) {
            return new InstagramMediaSource(URI.create(mediaUrl(media, "video_url", "video_versions")), "video");
        }
        return new InstagramMediaSource(URI.create(mediaUrl(media, "display_url", "image_versions2")), "image");
    }

    private String mediaUrl(JsonNode media, String directField, String versionsField) {
        String direct = media.path(directField).asString();
        if (direct != null && !direct.isBlank()) {
            return direct;
        }
        JsonNode versions = media.path(versionsField);
        if (versions.isObject()) {
            versions = versions.path("candidates");
        }
        String uri = versions.path(0).path("url").asString();
        if (uri == null || uri.isBlank()) {
            throw new ExtractionFailedException(ExtractionFailureReason.PROCESSING_FAILED);
        }
        return uri;
    }
}
