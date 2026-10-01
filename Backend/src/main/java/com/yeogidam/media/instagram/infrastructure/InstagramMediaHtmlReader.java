package com.yeogidam.media.instagram.infrastructure;

import com.yeogidam.media.instagram.domain.MediaMetadataWithUrl;
import com.yeogidam.media.instagram.domain.InstagramUrl;
import com.yeogidam.media.instagram.exception.InstagramContentUnavailableException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.HtmlUtils;

/** 인스타그램 공개 페이지의 head 메타 태그에서 게시물 정보를 읽는다.
 * 캡션은 og:description → description → twitter:description 순서로 찾고,
 * 썸네일은 twitter:image → og:image 순서로 찾습니다.
 * 작성자 정보는 캡션의 "likes, comments - 작성자 - 날짜:" 형식에서 가운데 작성자명을 추출합니다.
 * /p/ 캐러셀 썸네일은 embed 페이지의 원본 display_url을 우선하고, 찾지 못하면 메타 태그 썸네일을 사용합니다. */
@Component
public class InstagramMediaHtmlReader {

    private static final String USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
            + "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    private static final String USERNAME = "[A-Za-z0-9._]{1,30}";
    private static final String ENGLISH_DATE = "(?:January|February|March|April|May|June|July|August|September|"
            + "October|November|December)"
            + "\\s+\\d{1,2},\\s+\\d{4}";
    private static final String ENGAGEMENT_COUNT = "\\d[\\d.,]*[KMB]?";
    private static final List<Pattern> AUTHOR_PATTERNS = List.of(
            Pattern.compile("\\(@(" + USERNAME + ")\\)\\s*[•·]\\s*Instagram\\b", Pattern.CASE_INSENSITIVE),
            Pattern.compile("^\\s*@?(" + USERNAME + ")\\s*[-–—]\\s*" + ENGLISH_DATE + "\\s*:",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("^\\s*" + ENGAGEMENT_COUNT + "\\s+likes?,\\s*" + ENGAGEMENT_COUNT
                    + "\\s+comments?\\s*[-–—]\\s*@?(" + USERNAME + ")\\s+on\\s+" + ENGLISH_DATE + "\\s*:",
                    Pattern.CASE_INSENSITIVE),
            Pattern.compile("^\\s*" + ENGAGEMENT_COUNT + "\\s+likes?,\\s*" + ENGAGEMENT_COUNT
                    + "\\s+comments?\\s*[-–—]\\s*@?(" + USERNAME + ")\\s*[-–—]\\s*"
                    + ENGLISH_DATE + "\\s*:",
                    Pattern.CASE_INSENSITIVE));
    private static final Pattern META_TAG = Pattern.compile("<meta\\b([^>]*)>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTRIBUTE = Pattern.compile(
            "([a-zA-Z_:][a-zA-Z0-9_:.-]*)\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern EMBED_DISPLAY_URL = Pattern.compile(
            "display_url\\\\*\"\\s*:\\s*\\\\*\"(.+?)\\\\*\"");
    private static final Pattern EMBED_UNICODE_ESCAPE = Pattern.compile("\\\\+u([0-9a-fA-F]{4})");

    private final RestClient restClient;

    @Autowired
    public InstagramMediaHtmlReader(@Qualifier("instagramRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    public MediaMetadataWithUrl read(InstagramUrl instagramUrl) {
        String html;
        try {
            html = restClient.get()
                    .uri(instagramUrl.getSharedUrl())
                    .header("User-Agent", USER_AGENT)
                    .header("Accept-Language", "ko,en;q=0.9")
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException exception) {
            throw new InstagramContentUnavailableException("인스타그램 게시물 페이지 요청에 실패했습니다.", exception);
        }
        if (html == null || html.isBlank()) {
            throw new InstagramContentUnavailableException("인스타그램 게시물 페이지가 비어 있습니다.");
        }
        MediaMetadataWithUrl metadata = createMetadata(readMetaTags(html));
        String originalThumbnailUrl = fetchEmbedDisplayUrl(instagramUrl);
        if (originalThumbnailUrl == null) {
            return metadata;
        }
        return new MediaMetadataWithUrl(metadata.caption(), originalThumbnailUrl, metadata.author());
    }

    private MediaMetadataWithUrl createMetadata(Map<String, String> metaTags) {
        return new MediaMetadataWithUrl(
                firstMetaTag(metaTags, "og:description", "description", "twitter:description"),
                firstMetaTag(metaTags, "twitter:image", "og:image"),
                findAuthor(metaTags));
    }

    private String fetchEmbedDisplayUrl(InstagramUrl instagramUrl) {
        if (!instagramUrl.getSharedUrl().contains("/p/")) {
            return null;
        }
        try {
            String html = restClient.get()
                    .uri(embedPageUrl(instagramUrl.getSharedUrl()))
                    .header("User-Agent", USER_AGENT)
                    .retrieve()
                    .body(String.class);
            return parseEmbedDisplayUrl(html);
        } catch (RestClientException exception) {
            return null;
        }
    }

    private String embedPageUrl(String sharedUrl) {
        String postUrl = sharedUrl.split("[?#]", 2)[0].replaceFirst("/$", "");
        return postUrl + "/embed/";
    }

    private String parseEmbedDisplayUrl(String html) {
        if (html == null) {
            return null;
        }
        Matcher displayUrl = EMBED_DISPLAY_URL.matcher(html);
        if (!displayUrl.find()) {
            return null;
        }
        String url = decodeEmbedUrl(displayUrl.group(1));
        if (!url.startsWith("https://")) {
            return null;
        }
        return url;
    }

    private String decodeEmbedUrl(String url) {
        String decodedUnicode = decodeUnicodeEscapes(url);
        return decodedUnicode.replaceAll("\\\\+/", "/");
    }

    private String decodeUnicodeEscapes(String value) {
        Matcher escapes = EMBED_UNICODE_ESCAPE.matcher(value);
        StringBuffer decoded = new StringBuffer();
        while (escapes.find()) {
            String character = String.valueOf((char) Integer.parseInt(escapes.group(1), 16));
            escapes.appendReplacement(decoded, Matcher.quoteReplacement(character));
        }
        escapes.appendTail(decoded);
        return decoded.toString();
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

    private String findAuthor(Map<String, String> metaTags) {
        String[] names = { "twitter:title", "og:title", "og:description", "description", "twitter:description" };
        for (String name : names) {
            String username = findUsername(metaTags.get(name));
            if (username != null) {
                return username;
            }
        }
        return null;
    }

    private String findUsername(String content) {
        if (content == null) {
            return null;
        }
        for (Pattern pattern : AUTHOR_PATTERNS) {
            Matcher matcher = pattern.matcher(content);
            if (matcher.find()) {
                return matcher.group(1).toLowerCase(Locale.ROOT);
            }
        }
        return null;
    }

    private String firstMetaTag(Map<String, String> metaTags, String... names) {
        for (String name : names) {
            String value = metaTags.get(name);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
