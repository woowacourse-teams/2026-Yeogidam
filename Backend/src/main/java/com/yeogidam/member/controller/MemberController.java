package com.yeogidam.member.controller;

import com.yeogidam.member.dto.request.MemberCreateRequest;
import com.yeogidam.member.dto.response.MemberResponse;
import com.yeogidam.member.service.MemberService;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/members")
public class MemberController {

    private final MemberService memberService;

    public MemberController(MemberService memberService) {
        this.memberService = memberService;
    }

    @PostMapping
    public ResponseEntity<MemberResponse> createMember(
            @Valid @RequestBody MemberCreateRequest request
    ) {
        MemberResponse response = memberService.createMember(request);
        return ResponseEntity.created(URI.create("/member/" + response.id())).body(response);
    }
}
