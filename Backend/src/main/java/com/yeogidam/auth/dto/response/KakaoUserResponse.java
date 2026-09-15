package com.yeogidam.auth.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record KakaoUserResponse(

        Long id,

        @JsonProperty("kakao_account")
        Account account
) {
    public record Account(


            String email,

            @JsonProperty("is_email_valid")
            Boolean emailValid,

            @JsonProperty("is_email_verified")
            Boolean emailVerified,

            Profile profile
    ) {
    }

    public record Profile(

            String nickname,

            @JsonProperty("profile_image_url")
            String imageUrl
    ) {
    }
}
