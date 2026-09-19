package com.yeogidam.global.seed;

import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 로컬 실행용 회원 데이터. data-local.sql은 환경변수를 읽지 못하므로 카카오 회원번호가 들어가는 회원 행만 여기서 넣는다.
 * schema.sql과 data-local.sql이 끝난 뒤(ApplicationRunner) 실행되며, 회원번호가 비어 있으면 그 회원은 건너뛴다.
 * 회원 1이 정콩, 회원 2가 러키이고 data-local.sql의 saved_places가 이 id를 가리킨다.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class LocalMemberSeeder implements ApplicationRunner {

    private static final String KAKAO = "KAKAO";

    private final JdbcTemplate jdbcTemplate;

    @Value("${seed.kakao-user-id.bean:}")
    private String beanKakaoUserId;

    @Value("${seed.kakao-user-id.lucky:}")
    private String luckyKakaoUserId;

    @Override
    public void run(ApplicationArguments args) {
        insertMember(1L, beanKakaoUserId, "정콩", "bean@example.com");
        insertMember(2L, luckyKakaoUserId, "러키", "lucky@example.com");
    }

    private void insertMember(Long id, String kakaoUserId, String nickname, String email) {
        if (kakaoUserId.isBlank()) {
            return;
        }
        String sql = """
                INSERT INTO members (id, oauth_provider, provider_user_id, nickname, email, image_url)
                VALUES (?, ?, ?, ?, ?, NULL)
                """;
        jdbcTemplate.update(sql, id, KAKAO, kakaoUserId.getBytes(StandardCharsets.UTF_8), nickname, email);
    }
}
