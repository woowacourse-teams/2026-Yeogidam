package com.yeogidam.member.controller;

import com.yeogidam.member.dto.response.MemberResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;

/**
 * MemberController의 Swagger 문서. 문서 어노테이션만 두고, 요청 매핑과 인증 파라미터는 구현체가 맡는다.
 */
@Tag(name = "Member", description = "회원 API")
public interface MemberApiDocs {

    @Operation(summary = "내 정보 조회", description = "액세스 토큰의 회원 정보를 돌려줍니다. 토큰이 없으면 401(AUTH401_004), 유효하지 않으면 401(AUTH401_001)입니다.",
            security = @SecurityRequirement(name = "access-token"))
    ResponseEntity<MemberResponse> readMe(Long memberId);
}
