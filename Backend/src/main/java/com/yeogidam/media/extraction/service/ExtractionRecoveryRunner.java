package com.yeogidam.media.extraction.service;

import com.yeogidam.media.instagram.repository.InstagramMediaDao;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 파이프라인은 메모리 큐라 서버가 내려가면 작업이 사라지고,
 * EXTRACTING 상태는 재시도가 거부되어 스스로 빠져나올 수 없다.
 * 기동 시 남아 있는 EXTRACTING을 실패로 정리해 사용자가 재시도할 수 있게 한다.
 */
@Component
public class ExtractionRecoveryRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ExtractionRecoveryRunner.class);

    private final InstagramMediaDao instagramMediaDao;

    public ExtractionRecoveryRunner(InstagramMediaDao instagramMediaDao) {
        this.instagramMediaDao = instagramMediaDao;
    }

    @Override
    public void run(ApplicationArguments arguments) {
        int recovered = instagramMediaDao.failAllStuckExtracting();
        if (recovered > 0) {
            log.warn("[복구] 기동 시 추출 중이던 미디어 {}건을 실패로 정리했습니다.", recovered);
        }
    }
}
