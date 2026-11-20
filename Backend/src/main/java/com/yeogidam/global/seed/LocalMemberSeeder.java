package com.yeogidam.global.seed;

import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 로컬에서 사용할 회원 1(정콩)과 회원 2(러키)를 members 테이블에 추가한다.
 * Flyway가 테이블을 모두 만든 뒤, LocalDataSeeder가 SQL 파일을 실행하기 전에 실행한다.
 * db/seed/data-local.sql에는 두 회원의 공유 이력과 보관함을 만드는 INSERT가 있으므로 회원이 먼저 있어야 한다.
 * db/seed/data-onboarding.sql에 있는 온보딩 게시물과 장소 데이터는 그다음에 추가된다.
 *
 * SQL 파일은 환경변수를 직접 읽지 못하므로, 카카오 회원번호를 읽어 저장하는 작업은 이 클래스에서 한다.
 * .env의 SEED_KAKAO_USER_ID_BEAN은 회원 1, SEED_KAKAO_USER_ID_LUCKY는 회원 2의 카카오 회원번호다.
 * 지정한 카카오 회원번호는 members.provider_user_id에 저장한다. members.id는 각각 1과 2다.
 * 회원번호가 비어 있으면 provider_user_id에 회원 1은 "local-sample-1", 회원 2는 "local-sample-2"를 저장한다.
 * 이 두 문자열은 실제 카카오 회원번호가 아니라, 카카오 회원번호 없이도 개발용 데이터를 넣기 위한 값이다.
 * 실제 카카오 로그인으로 이 회원의 데이터를 사용하려면 .env에 자신의 카카오 회원번호를 지정하고 다시 실행한다.
 */
@Component
@Order(0)
@Profile("local & !test & !dev & !prod")
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
            kakaoUserId = "local-sample-" + id;
        }
        String sql = """
                INSERT INTO members (id, oauth_provider, provider_user_id, nickname, email, image_url)
                VALUES (?, ?, ?, ?, ?, NULL)
                """;
        jdbcTemplate.update(sql, id, KAKAO, kakaoUserId.getBytes(StandardCharsets.UTF_8), nickname, email);
    }
}
