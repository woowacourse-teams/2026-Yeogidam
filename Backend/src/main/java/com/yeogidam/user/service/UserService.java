package com.yeogidam.user.service;

import com.yeogidam.user.domain.Nickname;
import com.yeogidam.user.domain.User;
import com.yeogidam.user.dto.request.UserCreateRequest;
import com.yeogidam.user.dto.response.UserResponse;
import com.yeogidam.user.exception.UserNotFoundException;
import com.yeogidam.user.repository.UserDao;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class UserService {

    private final UserDao userDao;

    public UserService(UserDao userDao) {
        this.userDao = userDao;
    }

    @Transactional
    public UserResponse createUser(UserCreateRequest request) {
        User user = new User(null, new Nickname(request.nickname()));
        Long userId = userDao.insert(user.nickname().value());
        return new UserResponse(userId, user.nickname().value());
    }

    public void validateExists(Long userId) {
        userDao.findById(userId)
                .orElseThrow(UserNotFoundException::new);
    }
}
