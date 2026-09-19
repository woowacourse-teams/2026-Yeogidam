package com.yeogidam.apppolicy.controller;

import com.yeogidam.apppolicy.dto.AppUpdatePolicyResponse;
import com.yeogidam.apppolicy.service.AppUpdatePolicyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/app-update-policies")
@RequiredArgsConstructor
public class AppUpdatePolicyController implements AppUpdatePolicyApiDocs {

    private final AppUpdatePolicyService appUpdatePolicyService;

    @Override
    @GetMapping
    public ResponseEntity<AppUpdatePolicyResponse> readPolicy(
            @RequestParam(required = false) String platform,
            @RequestParam(required = false) String appVersion
    ) {
        AppUpdatePolicyResponse response = appUpdatePolicyService.readPolicy(platform, appVersion);
        return ResponseEntity.ok()
                .body(response);
    }
}
