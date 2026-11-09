package com.yeogidam.place.blog.infrastructure;

import com.yeogidam.place.blog.config.NaverApiHubProperties;
import com.yeogidam.place.blog.domain.BlogPost;
import com.yeogidam.place.blog.domain.BlogSearchResult;
import com.yeogidam.place.blog.exception.PlaceBlogErrorCode;
import com.yeogidam.place.blog.exception.PlaceBlogException;
import com.yeogidam.place.blog.service.BlogSearcher;
import java.net.URI;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.HtmlUtils;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;

/**
 * NAVER API HUB 블로그 검색으로 글을 찾는다. 네이버 검색 API 약관 2.2에 따라 결과의 순서와 내용은 바꾸지 않고,
 * 검색어를 감싼 강조 태그와 HTML 엔티티만 글자로 바꾼다.
 * 같은 조항이 원문 링크를 요구해서, 제목이나 원문 주소가 없어 보여 줄 수 없는 결과만 빼고 나머지 순서는 그대로 둔다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NaverBlogSearcher implements BlogSearcher {

    private static final URI API_ENDPOINT = URI.create("https://naverapihub.apigw.ntruss.com/search/v1/blog");

    private static final String SOURCE = "NAVER";
    private static final String KEY_ID_HEADER = "X-NCP-APIGW-API-KEY-ID";
    private static final String KEY_HEADER = "X-NCP-APIGW-API-KEY";
    private static final String SORT_BY_ACCURACY = "sim";

    private static final Pattern HIGHLIGHT_TAG = Pattern.compile("</?b>");

    private final RestClient restClient;
    private final NaverApiHubProperties properties;
    private final URI apiEndpoint;

    @Autowired
    public NaverBlogSearcher(
            @Qualifier("naverApiHubRestClient") RestClient restClient,
            NaverApiHubProperties properties
    ) {
        this(restClient, properties, API_ENDPOINT);
    }

    @Override
    public BlogSearchResult search(String query, int size) {
        JsonNode response = request(query, size);
        if (response == null || !response.path("items").isArray()) {
            log.error("[블로그 검색 실패] 응답에 items 배열이 없습니다.");
            throw new PlaceBlogException(PlaceBlogErrorCode.BLOG_SEARCH_FAILED);
        }
        List<BlogPost> posts = new ArrayList<>();
        for (JsonNode item : response.path("items")) {
            addPostIfReadable(posts, item);
        }
        return new BlogSearchResult(SOURCE, posts);
    }

    // 검색어를 템플릿 변수로 넣어야 장소 이름의 +가 공백으로 읽히지 않도록 %2B로 바뀐다.
    private JsonNode request(String query, int size) {
        URI uri = UriComponentsBuilder.fromUri(apiEndpoint)
                .queryParam("query", "{query}")
                .queryParam("display", size)
                .queryParam("sort", SORT_BY_ACCURACY)
                .encode()
                .buildAndExpand(query)
                .toUri();
        try {
            return restClient.get()
                    .uri(uri)
                    .header(KEY_ID_HEADER, properties.keyId())
                    .header(KEY_HEADER, properties.key())
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException exception) {
            log.error("[블로그 검색 실패] status={}", exception.getStatusCode().value());
            throw new PlaceBlogException(PlaceBlogErrorCode.BLOG_SEARCH_FAILED, exception);
        } catch (RestClientException exception) {
            log.error("[블로그 검색 실패] exception={}", exception.getClass().getSimpleName());
            throw new PlaceBlogException(PlaceBlogErrorCode.BLOG_SEARCH_FAILED, exception);
        } catch (IllegalArgumentException exception) {
            // 키에 헤더로 보낼 수 없는 글자가 섞이면 JDK가 키 값을 담은 메시지로 던지므로, 메시지도 원인 예외도 남기지 않는다.
            log.error("[블로그 검색 실패] 키를 헤더로 보낼 수 없습니다.");
            throw new PlaceBlogException(PlaceBlogErrorCode.BLOG_SEARCH_FAILED);
        }
    }

    private void addPostIfReadable(List<BlogPost> posts, JsonNode item) {
        String title = readText(item, "title");
        String link = readText(item, "link");
        if (title == null || link == null) {
            return;
        }
        posts.add(new BlogPost(title, readText(item, "bloggername"), readPostDate(item), link));
    }

    private LocalDate readPostDate(JsonNode item) {
        String postDate = readText(item, "postdate");
        if (postDate == null) {
            return null;
        }
        try {
            return LocalDate.parse(postDate, DateTimeFormatter.BASIC_ISO_DATE);
        } catch (DateTimeParseException exception) {
            return null;
        }
    }

    // 원문 주소에 &amp;가 오더라도 이동할 수 있도록 제목, 블로그 이름과 같은 변환을 거친다.
    // 태그를 먼저 걷고 엔티티를 바꿔야 제목에 원래 있던 &lt;b&gt;가 글자 <b>로 남는다.
    // HtmlUtils는 &apos;를 모르므로 같은 뜻의 &#39;로 바꿔 넘긴다.
    private String readText(JsonNode item, String field) {
        JsonNode node = item.path(field);
        if (!node.isString()) {
            return null;
        }
        String withoutTags = HIGHLIGHT_TAG.matcher(node.stringValue())
                .replaceAll("");
        String text = HtmlUtils.htmlUnescape(withoutTags.replace("&apos;", "&#39;"));
        if (text.isBlank()) {
            return null;
        }
        return text;
    }
}
