package com.yeogidam.support;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.support.HttpRequestWrapper;

public class OAuthProviderFixture implements AutoCloseable {

    private static final Map<String, String> ENDPOINTS = Map.of(
            "https://kauth.kakao.com/oauth/token", "/kakao/token",
            "https://kapi.kakao.com/v2/user/me", "/kakao/user",
            "https://oauth2.googleapis.com/token", "/google/token",
            "https://openidconnect.googleapis.com/v1/userinfo", "/google/user",
            "https://appleid.apple.com/auth/token", "/apple/token",
            "https://appleid.apple.com/auth/revoke", "/apple/revoke",
            "https://appleid.apple.com/auth/keys", "/keys"
    );

    private final HttpServer server;
    private final RSAKey signingKey;
    private final ECKey clientSecretKey;
    private final Set<String> usedCodes = ConcurrentHashMap.newKeySet();
    private final Map<String, Response> responses = new ConcurrentHashMap<>();
    private final Map<String, String> requests = new ConcurrentHashMap<>();
    private final Map<String, String> authorizationHeaders = new ConcurrentHashMap<>();

    public OAuthProviderFixture() {
        try {
            signingKey = new RSAKeyGenerator(2048)
                    .keyID("test-key")
                    .generate();
            clientSecretKey = new ECKeyGenerator(Curve.P_256)
                    .keyID("test-apple-key")
                    .generate();
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", this::handle);
            server.start();
            reset();
        } catch (IOException | JOSEException exception) {
            throw new IllegalStateException(exception);
        }
    }

    public void reset() {
        responses.clear();
        requests.clear();
        authorizationHeaders.clear();
        usedCodes.clear();
        respond("/keys", 200, new JWKSet(signingKey.toPublicJWK())
                .toString());
        respond("/kakao/token", 200, "{\"access_token\":\"test-kakao-token\"}");
        respond("/kakao/user", 200, "{\"id\":123}");
        respond("/google/token", 200, "{\"access_token\":\"test-google-token\"}");
        respond("/google/user", 200, "{\"sub\":\"google-user\"}");
        respond("/apple/token", 200, "{\"id_token\":\"" + sign("apple", "apple-user", null, claims -> {
        }) + "\"}");
    }

    public String applePrivateKey() {
        try {
            return Base64.getEncoder()
                    .encodeToString(clientSecretKey.toECPrivateKey()
                            .getEncoded());
        } catch (JOSEException exception) {
            throw new IllegalStateException(exception);
        }
    }

    public ECKey applePublicKey() {
        return clientSecretKey.toPublicJWK();
    }

    public String uri(String path) {
        return "http://127.0.0.1:" + server.getAddress()
                .getPort() + path;
    }

    public ClientHttpRequestInterceptor redirectRequests() {
        return (request, body, execution) -> {
            String path = ENDPOINTS.get(request.getURI()
                    .toString());
            if (path == null) {
                throw new AssertionError("테스트에 등록하지 않은 OAuth 요청 주소입니다: " + request.getURI());
            }
            return execution.execute(new HttpRequestWrapper(request) {

                @Override
                public URI getURI() {
                    return URI.create(uri(path));
                }
            }, body);
        };
    }

    public void respond(
            String path,
            int status,
            String body
    ) {
        responses.put(path, new Response(status, body));
    }

    public String requestBody(String path) {
        return requests.get(path);
    }

    public String authorizationHeader(String path) {
        return authorizationHeaders.get(path);
    }

    public String sign(
            String provider,
            String subject,
            String nonce,
            Consumer<JWTClaimsSet.Builder> customize
    ) {
        String issuer = "https://accounts.google.com";
        if (provider.equals("apple")) {
            issuer = "https://appleid.apple.com";
        }
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .audience("test-" + provider + "-client")
                .subject(subject)
                .issueTime(Date.from(Instant.now()))
                .expirationTime(Date.from(Instant.now()
                        .plusSeconds(600)))
                .claim("nonce", nonce);
        customize.accept(claims);
        try {
            SignedJWT token = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256)
                    .keyID("test-key")
                    .build(),
                    claims.build());
            token.sign(new RSASSASigner(signingKey));
            return token.serialize();
        } catch (JOSEException exception) {
            throw new IllegalStateException(exception);
        }
    }

    @Override
    public void close() {
        server.stop(0);
    }

    private void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI()
                .getPath();
        String requestBody = new String(exchange.getRequestBody()
                .readAllBytes(), StandardCharsets.UTF_8);
        requests.put(path, requestBody);
        String authorization = exchange.getRequestHeaders()
                .getFirst("Authorization");
        if (authorization != null) {
            authorizationHeaders.put(path, authorization);
        }
        Response response = responses.getOrDefault(path, new Response(404, "{}"));
        if (path.endsWith("/token") && response.status() == 200
                && !usedCodes.add(path + ":" + readFormValue(requestBody, "code"))) {
            response = new Response(400, "{\"error\":\"invalid_grant\"}");
        }
        byte[] bytes = response.body()
                .getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders()
                .set("Content-Type", "application/json");
        if (bytes.length == 0) {
            exchange.sendResponseHeaders(response.status(), -1);
            exchange.close();
            return;
        }
        exchange.sendResponseHeaders(response.status(), bytes.length);
        exchange.getResponseBody()
                .write(bytes);
        exchange.close();
    }

    private String readFormValue(String form, String name) {
        for (String parameter : form.split("&")) {
            String[] pair = parameter.split("=", 2);
            if (pair[0].equals(name) && pair.length == 2) {
                return URLDecoder.decode(pair[1], StandardCharsets.UTF_8);
            }
        }
        return "";
    }

    private record Response(
            int status,
            String body
    ) {

    }
}
