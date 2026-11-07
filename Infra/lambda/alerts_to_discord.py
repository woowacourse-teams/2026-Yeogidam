"""기존 SNS 알람과 CloudWatch Logs의 추출 실패 진단을 Discord에 전달한다.

알람: CloudWatch 알람 -> SNS yeogidam-alerts -> 이 Lambda -> Discord embed
진단: 운영 WARN/ERROR 로그 -> CloudWatch Logs 구독 필터 -> 이 Lambda -> Discord 문장

핸들러 lambda_function.lambda_handler, 기존 SNS 트리거와 DISCORD_WEBHOOK_URL을 유지한다.
환경별 알림 동작과 Logs 구독 필터, Lambda 호출 권한 설정은 같은 폴더 discord-alerts-guide.md를 따른다.
웹훅 오류는 함수 실행 실패로 남긴다. 재시도 시 문장 일부가 중복 전송될 수 있다.
"""

import base64
import binascii
import gzip
import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

COLOR_ALARM = 0xE74C3C
COLOR_OK = 0x2ECC71
COLOR_OTHER = 0x95A5A6

# Discord가 받아 주는 길이 상한이다. 넘기면 400으로 거절해 알림이 아예 안 간다.
CONTENT_LIMIT = 2000
TITLE_LIMIT = 256
DESCRIPTION_LIMIT = 4096
WEBHOOK_TIMEOUT_SECONDS = 10
MAX_RATE_LIMIT_RETRIES = 2
MAX_RATE_LIMIT_WAIT_SECONDS = 5
FAILURE_TYPE = "PLACE_EXTRACTION_FAILED"
FAILURE_REASONS = {"CONTENT_UNAVAILABLE", "PLACE_NOT_EXTRACTED", "PLACE_NOT_MATCHED", "PROCESSING_FAILED", "UNEXPECTED"}
REMOVED_FIELDS = {"analysis_id", "member_id", "shared_media_id", "targets"}

KST = timezone(timedelta(hours=9))


def handler(event, context):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL", "")
    if not webhook_url:
        raise RuntimeError("환경 변수 DISCORD_WEBHOOK_URL이 비어 있습니다.")
    if "awslogs" in event:
        return {"sent": handle_logs(event, webhook_url)}

    sent = 0
    for record in event.get("Records", []):
        message = record.get("Sns", {}).get("Message", "")
        body = parse_message(message)
        if isinstance(body, dict) and body.get("type") == FAILURE_TYPE:
            sent += send_failure(body, webhook_url)
            continue
        send(webhook_url, build_payload(message))
        sent += 1
    return {"sent": sent}


def handle_logs(event, webhook_url):
    try:
        compressed = base64.b64decode(event["awslogs"]["data"], validate=True)
        batch = json.loads(gzip.decompress(compressed))
    except (KeyError, TypeError, ValueError, OSError, EOFError, binascii.Error):
        raise ValueError("CloudWatch Logs 입력을 해석하지 못했습니다.") from None
    if batch.get("messageType") == "CONTROL_MESSAGE":
        return 0
    sent = 0
    for record in batch.get("logEvents", []):
        body = parse_message(record.get("message", ""))
        if not isinstance(body, dict) or body.get("level") not in {"WARN", "ERROR"} or body.get("type") != FAILURE_TYPE:
            continue
        sent += send_failure(body, webhook_url)
    return sent


def send_failure(body, webhook_url):
    diagnostic = validate_failure(body)
    if diagnostic.get("environment") != "prod":
        return 0
    diagnostic = redact(diagnostic, webhook_url)
    messages = failure_messages(diagnostic)
    for message in messages:
        send(webhook_url, {"content": message})
    return len(messages)


# 콘솔 기본 핸들러 이름이다. 함수를 만들 때 런타임 설정을 안 고쳐도 되게 같은 함수를 연다.
lambda_handler = handler


def parse_message(message):
    try:
        return json.loads(message)
    except (json.JSONDecodeError, TypeError):
        return None


def validate_failure(body):
    diagnostic = body.get("report")
    if type(body.get("version")) is not int or body["version"] != 1 or not isinstance(diagnostic, dict):
        raise ValueError("지원하지 않는 장소 추출 실패 진단 형식입니다.")
    if diagnostic.get("analysis_status") != "FAILED" or diagnostic.get("failure_reason") not in FAILURE_REASONS:
        raise ValueError("실패 결과가 올바르지 않습니다.")
    if not isinstance(diagnostic.get("environment"), str) or not diagnostic.get("failure_stage"):
        raise ValueError("진단 환경과 실패 단계가 필요합니다.")
    if not is_id(diagnostic.get("media_id")):
        raise ValueError("게시물 ID가 올바르지 않습니다.")
    return without_removed_fields(diagnostic)


def without_removed_fields(value):
    # 먼저 배포해도 이전 백엔드의 메시지를 처리하고, 제거한 식별자는 다시 전송하지 않는다.
    if isinstance(value, dict):
        return {key: without_removed_fields(item) for key, item in value.items() if key not in REMOVED_FIELDS}
    if isinstance(value, list):
        return [without_removed_fields(item) for item in value]
    return value


def is_id(value):
    return type(value) is int and value > 0


def failure_messages(diagnostic):
    reasons = {
        "CONTENT_UNAVAILABLE": "콘텐츠에 접근할 수 없습니다",
        "PLACE_NOT_EXTRACTED": "장소 단서를 추출하지 못했습니다",
        "PLACE_NOT_MATCHED": "일치하는 장소를 찾지 못했습니다",
        "PROCESSING_FAILED": "분석 요청 또는 결과 처리 중 오류가 발생했습니다",
        "UNEXPECTED": "예상하지 못한 오류가 발생했습니다",
    }
    reason = diagnostic["failure_reason"]
    lines = [
        "장소 추출 실패",
        "분석 시작: " + display(diagnostic.get("started_at")),
        "실패 이유: " + reasons[reason] + " (" + reason + ")",
        "실패 단계: " + diagnostic["failure_stage"],
        "게시물: " + display(diagnostic.get("instagram_url")),
    ]
    lines.extend(gemini_lines(diagnostic.get("gemini_results", [])))
    lines.extend(kakao_lines(diagnostic.get("kakao_requests", [])))
    lines.extend(error_lines(diagnostic.get("error")))
    if diagnostic.get("diagnostics_truncated"):
        lines.append("진단 수집 상한에 따라 일부 내용이 생략됐습니다.")
    return split_messages("\n".join(lines), diagnostic["media_id"])


def gemini_lines(results):
    if not results:
        return ["Gemini 결과: 미실행 또는 결과 수집 전 실패"]
    lines = []
    for result in results:
        if isinstance(result.get("raw_json"), str):
            lines.append("Gemini 분석 JSON (" + display(result.get("stage")) + "):")
            lines.append(result["raw_json"])
            continue
        lines.append("Gemini 결과 (" + display(result.get("stage")) + "): "
                     + display(result.get("response_count")) + "개 장소")
        for place in result.get("places", []):
            lines.append("- 장소명: " + display(place.get("name_in_caption"))
                         + " / 검색 보정명: " + display(place.get("name_search_hint")))
            for location in place.get("location_hints", []):
                lines.append("  위치 단서: " + display(location.get("value"))
                             + " / 종류: " + display(location.get("type"))
                             + " / 출처: " + display(location.get("basis")))
            accounts = place.get("account_hints", [])
            if accounts:
                lines.append("  계정 단서: " + ", ".join(accounts))
            if place.get("category_hint"):
                lines.append("  업종 단서: " + place["category_hint"])
    return lines


def kakao_lines(requests):
    if not requests:
        return ["카카오 결과: 미실행"]
    lines = []
    for index, request in enumerate(requests, 1):
        count = request.get("response_count")
        result = "미확인"
        if count is not None:
            result = str(count) + "건"
        lines.append("카카오 검색 " + str(index) + ": " + display(request.get("query")))
        lines.append("- 단계: " + display(request.get("stage")) + " / HTTP: "
                     + display(request.get("http_status")) + " / 결과: " + result)
        parameters = request.get("parameters", {})
        if parameters:
            lines.append("- 검색 조건: " + ", ".join(f"{key}={value}" for key, value in parameters.items()))
        for candidate in request.get("candidates", []):
            lines.append("- 후보: " + display(candidate.get("name"))
                         + " / 카카오 ID: " + display(candidate.get("kakao_place_id")))
            lines.append("  주소: " + display(candidate.get("address"))
                         + " / 도로명: " + display(candidate.get("road_address")))
            if candidate.get("exclusion_reason"):
                lines.append("  제외 이유: " + candidate["exclusion_reason"])
    return lines


def error_lines(error):
    if not isinstance(error, dict):
        return []
    lines = ["오류: " + display(error.get("type")) + " / " + display(error.get("message"))]
    if error.get("http_status") is not None:
        lines.append("오류 HTTP 상태: " + str(error["http_status"]))
    return lines + error_lines(error.get("cause"))


def display(value):
    if value is None:
        return "미확인"
    return str(value)


def split_messages(text, media_id):
    prefix = f"media_id: {media_id}\n"
    limit = CONTENT_LIMIT - len(prefix.encode("utf-16-le")) // 2
    messages = []
    start = 0
    units = 0
    for index, character in enumerate(text):
        size = 1
        if ord(character) > 0xFFFF:
            size = 2
        if units + size > limit:
            messages.append(prefix + text[start:index])
            start = index
            units = 0
        units += size
    if start < len(text):
        messages.append(prefix + text[start:])
    return messages


def redact(value, webhook_url):
    if isinstance(value, dict):
        return {key: redact(item, webhook_url) for key, item in value.items()}
    if isinstance(value, list):
        return [redact(item, webhook_url) for item in value]
    if not isinstance(value, str):
        return value
    token = urllib.parse.urlsplit(webhook_url).path.rsplit("/", 1)[-1]
    for secret in (webhook_url, token, urllib.parse.quote(token, safe="")):
        if secret:
            value = value.replace(secret, "[REDACTED]")
    return value


def build_payload(message):
    """기존 CloudWatch 알람과 일반 SNS 본문의 표시 형식을 유지한다."""
    body = parse_message(message)

    if not isinstance(body, dict) or "AlarmName" not in body:
        return {"content": clip(message or "(빈 메시지)", CONTENT_LIMIT)}

    state = body.get("NewStateValue", "")
    embed = {
        "title": clip(f"[{state}] {body['AlarmName']}", TITLE_LIMIT),
        "description": clip(body.get("NewStateReason", ""), DESCRIPTION_LIMIT),
        "color": color_of(state),
        "fields": [
            {"name": "시각", "value": to_kst(body.get("StateChangeTime", "")), "inline": True},
        ],
    }
    # 알람 설명은 콘솔에서 사람이 적는 칸이라 대응 방법을 적어 두면 여기로 같이 온다.
    description = body.get("AlarmDescription")
    if description:
        embed["fields"].append({"name": "설명", "value": clip(description, 1024), "inline": False})

    return {"embeds": [embed]}


def color_of(state):
    if state == "ALARM":
        return COLOR_ALARM
    if state == "OK":
        return COLOR_OK
    return COLOR_OTHER


def to_kst(state_change_time):
    """CloudWatch가 주는 2026-10-01T05:00:00.000+0000 꼴을 한국 시각으로 바꾼다. 못 읽으면 그대로 둔다."""
    try:
        parsed = datetime.strptime(state_change_time, "%Y-%m-%dT%H:%M:%S.%f%z")
    except (ValueError, TypeError):
        return state_change_time or "(없음)"
    return parsed.astimezone(KST).strftime("%Y-%m-%d %H:%M:%S KST")


def clip(text, limit):
    text = str(text)
    if len(text.encode("utf-16-le")) // 2 <= limit:
        return text
    return text.encode("utf-16-le")[: (limit - 1) * 2].decode("utf-16-le", errors="ignore") + "…"


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False).encode("utf-8")


def send(webhook_url, payload):
    payload = redact(payload, webhook_url)
    payload["allowed_mentions"] = {"parse": []}
    data = json_bytes(payload)
    content_type = "application/json"
    parsed = urllib.parse.urlsplit(webhook_url)
    query = [(key, value) for key, value in urllib.parse.parse_qsl(parsed.query) if key != "wait"]
    query.append(("wait", "true"))
    confirmed_url = parsed._replace(query=urllib.parse.urlencode(query)).geturl()
    request = urllib.request.Request(
        confirmed_url,
        data=data,
        headers={"Content-Type": content_type, "User-Agent": "yeogidam-alerts-to-discord"},
        method="POST",
    )
    post_to_discord(request)


def post_to_discord(request):
    remaining_wait = MAX_RATE_LIMIT_WAIT_SECONDS
    for attempt in range(MAX_RATE_LIMIT_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=WEBHOOK_TIMEOUT_SECONDS) as response:
                status = response.status
        except urllib.error.HTTPError as error:
            status = error.code
            delay = None
            if status == 429 and attempt < MAX_RATE_LIMIT_RETRIES:
                delay = retry_after(error)
            error.close()
            if delay is not None and delay <= remaining_wait:
                time.sleep(delay)
                remaining_wait -= delay
                continue
            # 본문이나 원본 예외의 웹훅 비밀값은 오류에 싣지 않는다.
            raise RuntimeError(f"Discord 웹훅이 {status}를 돌려주었습니다.") from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise RuntimeError("Discord 웹훅 연결 또는 응답에 실패했습니다.") from None
        if not 200 <= status < 300:
            raise RuntimeError(f"Discord 웹훅이 {status}를 돌려주었습니다.")
        return


def retry_after(error):
    try:
        value = error.headers.get("Retry-After")
        if value is None:
            value = json.loads(error.read(8192)).get("retry_after")
        delay = float(value)
        if math.isfinite(delay) and delay >= 0:
            return delay
    except (ValueError, TypeError, OSError, AttributeError):
        pass
    return None
