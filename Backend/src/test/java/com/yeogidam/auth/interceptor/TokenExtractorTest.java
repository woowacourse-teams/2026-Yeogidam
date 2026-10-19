package com.yeogidam.auth.interceptor;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;

class TokenExtractorTest {

    @Test
    void Bearer_헤더에서_토큰만_꺼낸다() {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer access.token.value");

        // when & then
        assertThat(TokenExtractor.extract(request)).contains("access.token.value");
    }

    @Test
    void 헤더가_없으면_빈_값이다() {
        assertThat(TokenExtractor.extract(new MockHttpServletRequest())).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Basic dXNlcjpwYXNz", "access.token.value", "Bearer", "Bearer   "})
    void Bearer_형식이_아니거나_토큰이_비어_있으면_빈_값이다(String header) {
        // given
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, header);

        // when & then
        assertThat(TokenExtractor.extract(request)).isEmpty();
    }
}
