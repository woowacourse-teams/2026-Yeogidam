package com.yeogidam.media.extraction.infrastructure;

import static com.yeogidam.media.extraction.infrastructure.GooglePlaceCandidateFinder.normalize;

import com.yeogidam.media.extraction.domain.LocationHint.Type;
import com.yeogidam.media.extraction.domain.PlaceSearchHint;
import com.yeogidam.media.extraction.service.OverseasPlaceSearcher;
import com.yeogidam.place.domain.Place;
import java.util.List;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 한국 밖 장소 단서를 Google Places에서 찾는다. 검색어와 후보 거르기는 {@link GooglePlaceCandidateFinder}가 맡는다.
 * 국내 프롬프트의 다지점 브랜드 규칙과 같이, 여러 지점이 있는 가게는 지점명, 주소, 장소 계정 근거가 있을 때만 넣는다.
 * 도시나 동네 이름만으로는 지점 근거로 보지 않는다.
 * Google 호출이 실패하면 경고만 남기고 찾지 못한 것으로 둬서, 같은 게시물에서 카카오로 찾은 국내 장소까지 잃지 않게 한다.
 * 상호는 Google 이름을 저장해서 지도 핀과 이름이 늘 같은 장소를 가리키게 하고, 요청 언어가 한국어라 한국어 표기가 있으면 한국어 이름이 온다.
 * 주소는 Google 주소를 그대로 저장하고, 업종은 Google 유형을 카카오 업종 경로로 바꿔 저장한다.
 * Google 상호와 주소와 업종을 저장하는 것은 place ID만 저장하라는 약관(Google Maps Platform 서비스 약관 3.2.3(a)(iii))과 다르다.
 */
@Slf4j
@Component
public class GoogleOverseasPlaceSearcher implements OverseasPlaceSearcher {

    // 「규카츠 모토무라 시부야점」, 「一蘭 渋谷店」처럼 끝 낱말이 지점을 뜻하는 이름
    private static final Pattern BRANCH_SUFFIX = Pattern.compile("(점|店)$");
    private static final Pattern PARENTHESES = Pattern.compile("\\([^)]*\\)|（[^）]*）");

    private final GooglePlaceCandidateFinder candidateFinder;

    public GoogleOverseasPlaceSearcher(GooglePlacesClient client) {
        this.candidateFinder = new GooglePlaceCandidateFinder(client);
    }

    @Override
    public List<Place> search(PlaceSearchHint hint) {
        List<Place> candidates = candidateFinder.findCandidates(hint, hint.countryCode());
        if (candidates.isEmpty()) {
            return List.of();
        }
        Place place = candidates.getFirst();
        if (isChainWithoutBranchEvidence(hint, place, candidates)) {
            log.info("지점 근거가 없는 다지점 가게라 넣지 않습니다. 나라={}, 장소={}",
                    hint.countryCode(), place.profile().name().value());
            return List.of();
        }
        return List.of(place);
    }

    // Google이 지점 이름이 붙은 가게를 골랐는데 단서 이름에 Google 이름의 지점이 없거나, 같은 이름의 가게가 결과에 둘 이상이면 지점을 모르는 것이다.
    private boolean isChainWithoutBranchEvidence(PlaceSearchHint hint, Place place, List<Place> candidates) {
        if (hasBranchClue(hint)) {
            return false;
        }
        String displayName = PARENTHESES.matcher(place.profile().name().value()).replaceAll(" ").strip();
        List<String> tokens = List.of(displayName.split("\\s+"));
        String lastToken = tokens.getLast();
        if (tokens.size() > 1 && BRANCH_SUFFIX.matcher(lastToken).find()) {
            return !namesContainBranch(hint, lastToken);
        }
        String brand = normalize(displayName);
        long sameBrand = candidates.stream()
                .map(candidate -> normalize(candidate.profile().name().value()))
                .filter(name -> name.contains(brand))
                .count();
        return sameBrand >= 2;
    }

    // 주소나 장소 계정이 있으면 지점을 가를 근거가 있다. 지역(REGION)은 근거로 보지 않는다.
    private boolean hasBranchClue(PlaceSearchHint hint) {
        return !hint.accountHints().isEmpty()
                || hint.locationHints().stream().anyMatch(location -> location.type() == Type.ADDRESS);
    }

    // 「시부야점」이면 단서 이름에 「시부야점」이나 「시부야」가 있어야 하고, 「본점」처럼 한 글자 지점명은 낱말 전체가 있어야 한다.
    private boolean namesContainBranch(PlaceSearchHint hint, String branchToken) {
        String branchName = branchToken.substring(0, branchToken.length() - 1);
        return GooglePlaceCandidateFinder.searchNames(hint).stream()
                .map(GooglePlaceCandidateFinder::normalize)
                .anyMatch(name -> name.contains(normalize(branchToken))
                        || (branchName.length() >= 2 && name.contains(normalize(branchName))));
    }
}
