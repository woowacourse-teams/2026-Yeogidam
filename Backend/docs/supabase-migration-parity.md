# 운영 Supabase 대조표 (bean-fable, ADR-02 구조)

2026-09-08, supabase CLI(gen types, functions list)로 운영 프로젝트 yegidam demo(hbbrgudsbvnwuylxqlta)의
public 스키마와 엣지 함수를 조회해 새 구조와 대조한 기록이다. 2026-09-09에 bean-fable 구현(task 14·15, member 개명 포함) 기준으로 이름과 대응을 재검증했다. 앱(frontend/src/lib/auth/supabase.ts)이 바라보는 프로젝트가 이 프로젝트다.

## 테이블 대응

| 운영 Supabase | bean-fable | 비고 |
|---|---|---|
| profiles | member | nickname만 이관. user가 MySQL 예약어라 member로 명명했다. description, avatar_url과 인증은 task 8 영역이다 |
| places | place | source_address와 google_place_id 두 컬럼은 미이관(아래 gap 1) |
| reel_extractions | instagram_media | shortcode 유일 게시물 + 추출 캐시. processing_token 경쟁 방어는 조건부 UPDATE로 대체했고 cacheable 플래그는 미이관 |
| reel_extraction_places | media_place | 추출 사실 연결. position 포함 동일 |
| reels | media_share | 운영은 공유 행마다 게시물 메타데이터 사본을 들었는데, 분리 구조에서는 게시물 join으로 대체된다. source, save_mode, request_id는 미이관(gap 4) |
| reel_places | share_place | review_status → decision_status, reviewed_at → decided_at. 재공유 교체를 위해 SUPERSEDED가 추가됐다 |
| reel_queue_batches, reel_queue_items | share_place | 운영의 대기함 배치 두 테이블이 공유 건 귀속 후보 하나로 합쳐졌다. 배치 resolved_at의 역할을 SUPERSEDED가 한다 |
| saved_places | saved_place | created_at → first_saved_at, last_saved_at 동일. (member, place) 유니크도 동일하다. 저장 항목별 thumbnail_url 오버라이드는 미이관(gap 3) |
| (user_related_reels 뷰) | saved_place_share | 운영은 핀의 연결 릴스를 뷰로 유도했고, 새 구조는 저장을 만든 공유 건과의 명시 연결로 남긴다 |
| reel_reports | media_share_report | user는 공유 건으로 유도되므로 컬럼에서 뺐다 |
| reel_place_match_failures | 없음 | 검문 실패 관측 로그. 미이관(gap 2) |
| provider_usage_monthly | 없음 | 구글 API 사용량 카운터. 구글 폴백 축과 함께 미이관(gap 1) |

## RPC와 엣지 함수 대응

| 운영 | bean-fable | 비고 |
|---|---|---|
| save-instagram-reel(-v2) 엣지 함수 | POST /media | 접수 진입점 |
| begin_reel_request, claim_reel_request, materialize_reel_request, reel_request_payload | InstagramMediaService.createInstagramMedia | find or create + 후보 교체 + 조건부 UPDATE 선점. request_id 멱등 키는 미이관(gap 4) |
| finalize_reel_extraction, fail_reel_extraction, persist_reel_place_result | ExtractionResultRecorder | 성공과 실패 기록, 장소 연결. 후보 발급(member별 최신 공유에만)이 더해졌다 |
| reset_pending_reel_results | ExtractionRecoveryRunner + recordFailure의 연결 정리 | 기동 시 EXTRACTING 잔여 복구 |
| resolve_queue_items | POST /media/{shareId}/place-selections, place-discards | 대기함 일괄 저장과 버림 |
| finalize_auto_save_reel | 없음 | save_mode(auto) 자체 미이관(gap 4) |
| reserve_google_places_thumbnail | 없음 | 구글 폴백 미구현(gap 1) |
| reset_test_data | 해당 없음 | H2가 기동마다 재생성된다 |
| delete-account 엣지 함수 | 없음 | 인증 영역(task 8, gap 5) |
| gemini-quota-discord, app-update-policy 엣지 함수 | 없음 | 운영 부가 기능(gap 6) |

## 남은 gap

1. 구글 사진 폴백 축: places.google_place_id, source_address, provider_usage_monthly, reserve_google_places_thumbnail. place 문서의 「남은 결정」에 있던 항목으로, PlaceThumbnail과 스키마 컬럼(thumbnail_source, photo_attribution)은 준비돼 있다.
2. 검문 실패 관측: reel_place_match_failures. feature-list 미구현 목록의 로깅 계층 항목과 같다.
3. 저장 항목별 썸네일: saved_places.thumbnail_url. 지금은 장소의 썸네일 하나로 표시한다.
4. 접수 부가 정보: reels.source(유입 경로), save_mode와 finalize_auto_save_reel(자동 저장), request_id(클라이언트 멱등 키). 기능 명세 범위 밖이라 뒀고, 필요해지면 media_share 컬럼 추가로 국소 확장된다.
5. 계정: profiles의 description, avatar_url, delete-account. 인증(task 8)과 함께 간다.
6. 운영 도구: gemini-quota-discord(쿼터 알림), app-update-policy(앱 업데이트 정책). 서버 이관 범위 밖이다.

기능 명세의 유스케이스(공유 접수, 재사용, 대기함 후보와 교체, 저장과 버림, 보관함과 연결 릴스, 제보, 재시도)는 전부 대응이 확인됐다.
