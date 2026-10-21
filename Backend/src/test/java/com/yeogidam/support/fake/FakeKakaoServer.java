package com.yeogidam.support.fake;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class FakeKakaoServer {

    private final HttpServer server;
    private final Map<String, String> responses = new HashMap<>();
    private final Map<String, String> addressResponses = new HashMap<>();
    private final Map<String, String> nearbyResponses = new HashMap<>();
    private final List<String> queries = new ArrayList<>();
    private final List<String> addressQueries = new ArrayList<>();
    private Map<String, String> lastKeywordParameters = new HashMap<>();
    private String authorization;
    private int status = 200;

    public FakeKakaoServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/v2/local/search/keyword.json", this::handle);
        server.createContext("/v2/local/search/address.json", this::handleAddress);
        server.start();
    }

    private void handle(HttpExchange exchange) throws IOException {
        String query = readQuery(exchange.getRequestURI());
        int page = readPage(exchange.getRequestURI());
        queries.add(query);
        lastKeywordParameters = readParameters(exchange.getRequestURI());
        authorization = exchange.getRequestHeaders().getFirst("Authorization");
        Map<String, String> table = lastKeywordParameters.containsKey("x") ? nearbyResponses : responses;
        respond(exchange, table.getOrDefault(query + "|" + page, "{\"documents\":[]}"));
    }

    private void handleAddress(HttpExchange exchange) throws IOException {
        String query = readQuery(exchange.getRequestURI());
        addressQueries.add(query);
        respond(exchange, addressResponses.getOrDefault(query, "{\"documents\":[]}"));
    }

    private void respond(HttpExchange exchange, String body) throws IOException {
        byte[] response = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, response.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(response);
        }
    }

    private Map<String, String> readParameters(URI requestUri) {
        Map<String, String> parameters = new HashMap<>();
        for (String parameter : requestUri.getRawQuery().split("&")) {
            String[] pair = parameter.split("=", 2);
            parameters.put(pair[0], URLDecoder.decode(pair.length > 1 ? pair[1] : "", StandardCharsets.UTF_8));
        }
        return parameters;
    }

    private String readQuery(URI requestUri) {
        for (String parameter : requestUri.getRawQuery().split("&")) {
            if (parameter.startsWith("query=")) {
                return URLDecoder.decode(parameter.substring("query=".length()), StandardCharsets.UTF_8);
            }
        }
        throw new IllegalStateException("카카오 테스트 요청에 검색어가 없습니다.");
    }

    private int readPage(URI requestUri) {
        for (String parameter : requestUri.getRawQuery().split("&")) {
            if (parameter.startsWith("page=")) {
                return Integer.parseInt(parameter.substring("page=".length()));
            }
        }
        return 1;
    }

    public void respondWith(String query, String response) {
        respondWithPage(query, 1, response);
    }

    public void respondWithPage(String query, int page, String response) {
        responses.put(query + "|" + page, response);
    }

    public void respondWithStatus(int status) {
        this.status = status;
    }

    public void respondNearby(String query, String response) {
        nearbyResponses.put(query + "|1", response);
    }

    public void respondToAddress(String address, String x, String y) {
        addressResponses.put(address,
                "{\"documents\":[{\"address_name\":\"" + address + "\",\"x\":\"" + x + "\",\"y\":\"" + y + "\"}]}");
    }

    public List<String> addressQueries() {
        return addressQueries;
    }

    public Map<String, String> lastKeywordParameters() {
        return lastKeywordParameters;
    }

    public URI endpoint() {
        return URI.create("http://localhost:" + server.getAddress().getPort()
                + "/v2/local/search/keyword.json");
    }

    public List<String> queries() {
        return queries;
    }

    public String authorization() {
        return authorization;
    }

    public void reset() {
        responses.clear();
        addressResponses.clear();
        nearbyResponses.clear();
        queries.clear();
        addressQueries.clear();
        lastKeywordParameters.clear();
        authorization = null;
        status = 200;
    }

    public void close() {
        server.stop(0);
    }
}
