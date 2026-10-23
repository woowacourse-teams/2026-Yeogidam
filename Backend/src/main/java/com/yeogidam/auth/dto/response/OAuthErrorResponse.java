package com.yeogidam.auth.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record OAuthErrorResponse(

        String error,

        @JsonProperty("error_code")
        String errorCode,

        Integer code
) {
}
