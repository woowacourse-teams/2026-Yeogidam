package com.yeogidam.media.instagram.exception;

public class InstagramContentUnavailableException extends RuntimeException {

    public InstagramContentUnavailableException(String message) {
        super(message);
    }

    public InstagramContentUnavailableException(String message, Throwable cause) {
        super(message, cause);
    }
}
