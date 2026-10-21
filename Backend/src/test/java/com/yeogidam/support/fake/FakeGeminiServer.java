package com.yeogidam.support.fake;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class FakeGeminiServer {

    private final HttpServer server;
    private final AtomicReference<String> responseBody = new AtomicReference<>();
    private final AtomicReference<String> requestBody = new AtomicReference<>();
    private final AtomicReference<String> apiKey = new AtomicReference<>();
    private final AtomicInteger requestCount = new AtomicInteger();
    private final Map<String, KeyResponse> keyResponses = new ConcurrentHashMap<>();
    private final List<String> requestedKeys = new CopyOnWriteArrayList<>();

    public FakeGeminiServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/v1/interactions", this::handle);
        server.start();
    }

    private void handle(HttpExchange exchange) throws IOException {
        requestCount.incrementAndGet();
        requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
        String requestKey = exchange.getRequestHeaders().getFirst("x-goog-api-key");
        apiKey.set(requestKey);
        requestedKeys.add(requestKey);
        KeyResponse keyResponse = keyResponses.getOrDefault(requestKey, new KeyResponse(200, responseBody.get(), Map.of()));
        byte[] response = keyResponse.body().getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        keyResponse.headers().forEach((name, value) -> exchange.getResponseHeaders().set(name, value));
        exchange.sendResponseHeaders(keyResponse.status(), response.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(response);
        }
    }

    public void respondWith(String response) {
        responseBody.set(response);
    }

    // 특정 key로 온 요청에만 정한 상태와 본문으로 답한다. 나머지 key는 respondWith의 정상 응답을 받는다.
    public void respondToKeyWith(String key, int status, String body, Map<String, String> headers) {
        keyResponses.put(key, new KeyResponse(status, body, headers));
    }

    public void clearKeyResponse(String key) {
        keyResponses.remove(key);
    }

    public List<String> requestedKeys() {
        return List.copyOf(requestedKeys);
    }

    public URI endpoint() {
        return URI.create("http://localhost:" + server.getAddress().getPort() + "/v1/interactions");
    }

    public String requestBody() {
        return requestBody.get();
    }

    public String apiKey() {
        return apiKey.get();
    }

    public int requestCount() {
        return requestCount.get();
    }

    public void reset() {
        responseBody.set(null);
        requestBody.set(null);
        apiKey.set(null);
        requestCount.set(0);
        keyResponses.clear();
        requestedKeys.clear();
    }

    public void close() {
        server.stop(0);
    }

    private record KeyResponse(
            int status,
            String body,
            Map<String, String> headers
    ) {
    }
}
