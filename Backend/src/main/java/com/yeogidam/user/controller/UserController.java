package com.yeogidam.user.controller;

import com.yeogidam.user.dto.request.UserCreateRequest;
import com.yeogidam.user.dto.response.UserResponse;
import com.yeogidam.user.service.UserService;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @PostMapping
    public ResponseEntity<UserResponse> createUser(
            @Valid @RequestBody UserCreateRequest request
    ) {
        UserResponse response = userService.createUser(request);
        return ResponseEntity.created(URI.create("/users/" + response.id())).body(response);
    }
}
