package com.yeogidam.apppolicy.controller;

import com.yeogidam.apppolicy.dto.AppUpdatePolicyResponse;
import com.yeogidam.global.dto.ErrorResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * AppUpdatePolicyController의 Swagger 문서. 문서 어노테이션만 두고 요청 매핑은 구현체가 맡는다.
 */
@Tag(name = "AppUpdatePolicy", description = "앱 업데이트 정책 API")
public interface AppUpdatePolicyApiDocs {

    @Operation(summary = "앱 업데이트 정책 조회",
            description = """
                    앱이 켜질 때 업데이트가 필요한지 물어보는 API입니다. 인증 없이 호출합니다.

                    - `updateRequired`가 true면 강제입니다. 앱은 닫을 수 없는 모달을 띄우고 `storeUrl`로 보냅니다.
                    - `updateRecommended`가 true면 권고입니다. 앱은 닫을 수 있는 안내만 띄웁니다.
                    - 비교는 서버가 합니다. 두 값이 동시에 true가 되지 않습니다.
                    - `appVersion`은 `주.부.수정`이고 두 자리(1.2)는 1.2.0으로 봅니다.
                    """,
            responses = {
                    @ApiResponse(responseCode = "200", description = "정책과 판정",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = AppUpdatePolicyResponse.class))),
                    @ApiResponse(responseCode = "400", description = "platform 또는 appVersion이 잘못됨",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "APP400_001", description = "platform이 ios, android가 아닐 때",
                                                    value = """
                                                    {"message": "platform은 ios 또는 android여야 합니다.", "errorCode": "APP400_001"}
                                                    """),
                                            @ExampleObject(name = "APP400_002", description = "appVersion이 주.부.수정 형식이 아닐 때",
                                                    value = """
                                                    {"message": "appVersion은 주.부.수정 형식이어야 합니다.", "errorCode": "APP400_002"}
                                                    """)
                                    }))
            })
    ResponseEntity<AppUpdatePolicyResponse> readPolicy(
            @Parameter(description = "ios 또는 android", example = "ios") String platform,
            @Parameter(description = "앱 버전(주.부.수정)", example = "1.1.0") String appVersion
    );
}
