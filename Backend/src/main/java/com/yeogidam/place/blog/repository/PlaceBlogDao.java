package com.yeogidam.place.blog.repository;

import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
@RequiredArgsConstructor
public class PlaceBlogDao {

    private final JdbcTemplate jdbcTemplate;

    /**
     * 장소 상세 블로그 탭의 검색어를 만들 장소 이름과 지번 주소를 읽는다.
     */
    public Optional<PlaceBlogQueryProjection> findQueryByPlaceId(Long placeId) {
        String sql = """
                SELECT name, land_lot_address
                FROM places
                WHERE id = ?
                """;
        return jdbcTemplate.query(sql, (resultSet, rowNumber) -> new PlaceBlogQueryProjection(
                        resultSet.getString("name"),
                        resultSet.getString("land_lot_address")
                ), placeId)
                .stream()
                .findFirst();
    }
}
