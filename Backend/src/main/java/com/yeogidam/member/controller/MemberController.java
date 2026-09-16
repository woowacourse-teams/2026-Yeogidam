package com.yeogidam.member.controller;

import com.yeogidam.auth.resolver.LoginMember;
import com.yeogidam.member.dto.response.MemberResponse;
import com.yeogidam.member.service.MemberService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/members")
@RequiredArgsConstructor
public class MemberController implements MemberApiDocs {

    private final MemberService memberService;

    @Override
    @GetMapping("/me")
    public ResponseEntity<MemberResponse> readMe(@LoginMember Long memberId) {
        MemberResponse response = memberService.readMember(memberId);
        return ResponseEntity.ok()
                .body(response);
    }
}
