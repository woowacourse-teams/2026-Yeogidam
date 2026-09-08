package com.yeogidam.place.exception;

import com.yeogidam.global.exception.BusinessException;

public class SavedPlaceNotFoundException extends BusinessException {

    public SavedPlaceNotFoundException() {
        super(PlaceErrorType.SAVED_PLACE_NOT_FOUND);
    }
}
