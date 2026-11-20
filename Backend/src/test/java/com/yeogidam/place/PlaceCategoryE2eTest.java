package com.yeogidam.place;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;

import com.yeogidam.support.E2eTestSupport;
import org.junit.jupiter.api.Test;

class PlaceCategoryE2eTest extends E2eTestSupport {

    @Test
    void 장소가_없어도_비회원에게_칩_열한개를_정해진_순서로_돌려준다() {
        // when & then
        given()
                .when()
                .get("/api/v1/place-categories")
                .then()
                .statusCode(200)
                .body("categories", hasSize(11))
                .body("categories.code", contains(
                        "CAFE", "DESSERT", "KOREAN", "WESTERN", "JAPANESE", "CHINESE",
                        "BUNSIK", "BAR", "SPECIALTY", "CULTURE_LEISURE", "ETC"
                ))
                .body("categories.name", contains(
                        "카페", "디저트", "한식", "양식", "일식", "중식", "분식", "술집", "별미", "문화/여가", "기타"
                ));
    }
}
