package com.yeogidam.folder.exception;

import com.yeogidam.global.exception.YeogidamException;

public class FolderException extends YeogidamException {

    public FolderException(FolderErrorCode errorCode) {
        super(errorCode);
    }
}
