package com.yeogidam.media.share.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.media.share.dto.response.PlaceCandidateResponses;
import com.yeogidam.media.share.service.PlaceCandidateService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/place-candidates")
@RequiredArgsConstructor
public class PlaceCandidateController implements PlaceCandidateApiDocs {

    private final PlaceCandidateService placeCandidateService;

    @Override
    @GetMapping
    public ResponseEntity<PlaceCandidateResponses> readPlaceCandidates(@LoginMember Long memberId) {
        PlaceCandidateResponses response = placeCandidateService.readPlaceCandidates(memberId);
        return ResponseEntity.ok()
                .body(response);
    }
}
