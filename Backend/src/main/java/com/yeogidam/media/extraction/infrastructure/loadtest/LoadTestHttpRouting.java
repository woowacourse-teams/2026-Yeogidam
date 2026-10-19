package com.yeogidam.media.extraction.infrastructure.loadtest;

import com.yeogidam.media.extraction.config.LoadTestProperties;
import java.net.URI;
import java.util.Locale;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;

@RequiredArgsConstructor
public class LoadTestHttpRouting {

    private final LoadTestProperties properties;

    public String service(URI uri) {
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        if (host.equals("instagram.com") || host.equals("www.instagram.com")) {
            return "instagram";
        }
        if (host.equals("generativelanguage.googleapis.com")) {
            return "gemini";
        }
        if (host.equals("dapi.kakao.com")) {
            return "kakao";
        }
        if (host.equals("place.map.kakao.com") || host.equals("map.kakao.com") || host.equals("m.map.kakao.com")) {
            return "place-page";
        }
        return "image";
    }

    public boolean isFake() {
        return LoadTestScope.currentShortcode() != null;
    }

    public URI route(URI original) {
        if (!isFake()) {
            return original;
        }
        String path = "/external/" + service(original) + original.getRawPath();
        if (original.getRawQuery() != null) {
            path += "?" + original.getRawQuery();
        }
        return properties.fakeBaseUrl().resolve(path);
    }

    public HttpHeaders headers(HttpHeaders original) {
        if (!isFake()) {
            return original;
        }
        HttpHeaders headers = new HttpHeaders();
        copyHeader(original, headers, HttpHeaders.CONTENT_TYPE);
        copyHeader(original, headers, HttpHeaders.ACCEPT);
        copyHeader(original, headers, HttpHeaders.USER_AGENT);
        headers.set("X-Load-Test-Key", properties.fakeKey());
        headers.set("X-Load-Test-Shortcode", LoadTestScope.currentShortcode());
        return headers;
    }

    private void copyHeader(HttpHeaders original, HttpHeaders target, String name) {
        if (original.containsHeader(name)) {
            target.put(name, original.get(name));
        }
    }
}
