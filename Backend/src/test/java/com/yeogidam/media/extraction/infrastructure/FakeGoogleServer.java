package com.yeogidam.media.extraction.infrastructure;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Google Places Text Search 대신 검색어마다 미리 넣어 둔 응답을 돌려주고, 받은 요청을 남기는 로컬 HTTP 서버다. */
final class FakeGoogleServer {

    private final HttpServer server;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();
    private final Map<String, String> responses = new HashMap<>();
    private final List<String> queries = new ArrayList<>();
    private JsonNode lastBody;
    private String apiKey;
    private String fieldMask;
    private int status = 200;

    FakeGoogleServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/v1/places:searchText", this::handle);
        server.start();
    }

    private void handle(HttpExchange exchange) throws IOException {
        lastBody = jsonMapper.readTree(exchange.getRequestBody().readAllBytes());
        String query = lastBody.path("textQuery").asString();
        queries.add(query);
        apiKey = exchange.getRequestHeaders().getFirst("X-Goog-Api-Key");
        fieldMask = exchange.getRequestHeaders().getFirst("X-Goog-FieldMask");
        byte[] response = responses.getOrDefault(query, "{}").getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, response.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(response);
        }
    }

    void respondWith(String query, String response) {
        responses.put(query, response);
    }

    void respondWithStatus(int status) {
        this.status = status;
    }

    List<String> queries() {
        return queries;
    }

    JsonNode lastBody() {
        return lastBody;
    }

    String apiKey() {
        return apiKey;
    }

    String fieldMask() {
        return fieldMask;
    }

    URI endpoint() {
        return URI.create("http://localhost:" + server.getAddress().getPort() + "/v1/places:searchText");
    }

    void close() {
        server.stop(0);
    }

    static String places(String... places) {
        return "{\"places\":[" + String.join(",", places) + "]}";
    }

    static String place(String id, String name, String address, String country, String primaryType) {
        return """
                {"id":"%s","displayName":{"text":"%s","languageCode":"ko"},"formattedAddress":"%s",
                 "location":{"latitude":35.6614,"longitude":139.7006},"primaryType":"%s",
                 "types":["%s","restaurant","food"],
                 "addressComponents":[{"longText":"%s","shortText":"%s","types":["country","political"]}]}
                """.formatted(id, name, address, primaryType, primaryType, country, country);
    }
}
