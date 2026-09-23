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
@RequiredArgsConstructor
@RequestMapping("/api/v1/app-update-policies")
public class AppUpdatePolicyController implements AppUpdatePolicyApiDocs {

    private final AppUpdatePolicyService appUpdatePolicyService;

    @Override
    @GetMapping
    public ResponseEntity<AppUpdatePolicyResponse> readPolicy(
            @RequestParam String platform,
            @RequestParam String appVersion
    ) {
        AppUpdatePolicyResponse response = appUpdatePolicyService.readPolicy(platform, appVersion);
        return ResponseEntity.ok()
                .body(response);
    }
}
