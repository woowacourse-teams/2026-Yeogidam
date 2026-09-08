package com.yeogidam.media.service;

import com.yeogidam.media.repository.InstagramMediaReportDao;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class InstagramMediaReportService {

    private final InstagramMediaReader instagramMediaReader;
    private final InstagramMediaReportDao instagramMediaReportDao;

    public InstagramMediaReportService(
            InstagramMediaReader instagramMediaReader,
            InstagramMediaReportDao instagramMediaReportDao
    ) {
        this.instagramMediaReader = instagramMediaReader;
        this.instagramMediaReportDao = instagramMediaReportDao;
    }

    @Transactional
    public void createReport(
            Long userId,
            Long mediaId
    ) {
        instagramMediaReader.readOwnedRecord(userId, mediaId);
        instagramMediaReportDao.insert(mediaId);
    }
}
