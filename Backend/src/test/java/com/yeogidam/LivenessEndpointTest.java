package com.yeogidam;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.yeogidam.support.MySqlContainerSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * 배포 헬스체크가 쓰는 액추에이터 설정을 고정한다. Dockerfile의 HEALTHCHECK와 배포 스크립트가 liveness만 본다.
 * 세부를 감추는 설정이라 readiness는 열려 있으면 안 된다.
 */
@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class LivenessEndpointTest extends MySqlContainerSupport {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void 기동하면_liveness가_UP을_돌려준다() throws Exception {
        mockMvc.perform(get("/actuator/health/liveness"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"status\":\"UP\"}"));
    }

    @Test
    void readiness는_열지_않는다() throws Exception {
        mockMvc.perform(get("/actuator/health/readiness"))
                .andExpect(status().isNotFound());
    }
}
