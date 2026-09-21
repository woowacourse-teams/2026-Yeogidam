package com.yeogidam.apppolicy.dto;

import com.yeogidam.apppolicy.domain.UpdateDecision;

public record AppUpdatePolicyResponse(
        boolean updateRequired,
        boolean updateRecommended,
        String minimumSupportedVersion,
        String latestVersion,
        String storeUrl
) {
    public static AppUpdatePolicyResponse from(UpdateDecision decision) {
        return new AppUpdatePolicyResponse(
                decision.required(),
                decision.recommended(),
                decision.policy().minimumSupportedVersion().value(),
                decision.policy().latestVersion().value(),
                decision.policy().storeUrl()
        );
    }
}
