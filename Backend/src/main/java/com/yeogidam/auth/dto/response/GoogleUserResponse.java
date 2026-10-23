package com.yeogidam.auth.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record GoogleUserResponse(

        String sub,

        String name,

        String email,

        @JsonProperty("email_verified")
        Boolean emailVerified,

        String picture
) {
}
