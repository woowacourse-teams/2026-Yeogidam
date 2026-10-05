package com.yeogidam.media.share.service;

import com.yeogidam.media.exception.MediaErrorCode;
import com.yeogidam.media.exception.MediaException;
import com.yeogidam.media.extraction.domain.ExtractionStatus;
import com.yeogidam.media.share.domain.SharedMediaReport;
import com.yeogidam.media.share.repository.SharedMediaDao;
import com.yeogidam.media.share.repository.SharedMediaReportDao;
import java.time.Clock;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ShareReportService {

    private final Clock clock;
    private final SharedMediaDao sharedMediaDao;
    private final SharedMediaReportDao sharedMediaReportDao;

    @Transactional
    public void createReport(Long memberId, Long sharedMediaId) {
        ExtractionStatus status = sharedMediaDao.findExtractionStatus(memberId, sharedMediaId)
                .orElseThrow(() -> new MediaException(MediaErrorCode.SHARED_MEDIA_NOT_FOUND));
        SharedMediaReport report = new SharedMediaReport(sharedMediaId, status, clock.instant());
        saveReport(report);
    }

    private void saveReport(SharedMediaReport report) {
        try {
            sharedMediaReportDao.save(report);
        } catch (DuplicateKeyException exception) {
            throw new MediaException(MediaErrorCode.ALREADY_REPORTED);
        }
    }
}
