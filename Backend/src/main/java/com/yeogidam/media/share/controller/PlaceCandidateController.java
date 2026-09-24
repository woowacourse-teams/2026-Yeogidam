package com.yeogidam.media.share.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.media.share.dto.response.SharedMediaWithPlaceCandidatesResponses;
import com.yeogidam.media.share.service.PlaceCandidateService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/place-candidates")
public class PlaceCandidateController implements PlaceCandidateApiDocs {

    private final PlaceCandidateService placeCandidateService;

    @Override
    @GetMapping
    public ResponseEntity<SharedMediaWithPlaceCandidatesResponses> readPlaceCandidates(@LoginMember Long memberId) {
        SharedMediaWithPlaceCandidatesResponses response = placeCandidateService.readPlaceCandidates(memberId);
        return ResponseEntity.ok()
                .body(response);
    }
}
