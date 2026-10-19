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
 * AppUpdatePolicyController의 Swagger 문서로, 문서 어노테이션만 두고 요청 매핑은 구현체가 맡는다.
 */
@Tag(name = "AppUpdatePolicy", description = "앱 업데이트 정책 API입니다.")
public interface AppUpdatePolicyApiDocs {

    @Operation(summary = "앱 업데이트 정책 조회",
            description = """
                    앱이 켜질 때 업데이트가 필요한지 물어보는 API이며 인증 없이 호출합니다.

                    - `updateRequired`가 true면 강제 업데이트이므로 앱은 닫을 수 없는 모달을 띄우고 사용자를 `storeUrl`로 보냅니다.
                    - `updateRecommended`가 true면 권고 업데이트이므로 앱은 닫을 수 있는 안내만 띄웁니다.
                    - 버전 비교는 서버가 하며 `updateRequired`와 `updateRecommended`가 동시에 true가 되지 않습니다.
                    - `appVersion`은 `주.부.수정` 형식이고 두 자리(1.2)는 1.2.0으로 봅니다.
                    """,
            responses = {
                    @ApiResponse(responseCode = "200", description = "업데이트 정책과 판정 결과를 돌려줍니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = AppUpdatePolicyResponse.class))),
                    @ApiResponse(responseCode = "400", description = "platform 또는 appVersion이 없거나 잘못되었습니다.",
                            content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                                    schema = @Schema(implementation = ErrorResponse.class),
                                    examples = {
                                            @ExampleObject(name = "COMMON400_003", description = "platform이나 appVersion을 아예 보내지 않았을 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "필수 요청 파라미터가 누락되었습니다.", "errorCode": "COMMON400_003"}
                                                    """),
                                            @ExampleObject(name = "APP400_001", description = "platform이 ios도 android도 아닐 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "platform은 ios 또는 android여야 합니다.", "errorCode": "APP400_001"}
                                                    """),
                                            @ExampleObject(name = "APP400_002", description = "appVersion이 주.부.수정 형식이 아닐 때 돌려줍니다.",
                                                    value = """
                                                    {"message": "appVersion은 주.부.수정 형식이어야 합니다.", "errorCode": "APP400_002"}
                                                    """)
                                    }))
            })
    ResponseEntity<AppUpdatePolicyResponse> readPolicy(
            @Parameter(description = "ios 또는 android이며 필수입니다.", example = "ios") String platform,
            @Parameter(description = "앱 버전(주.부.수정)이며 필수입니다.", example = "1.1.0") String appVersion
    );
}
