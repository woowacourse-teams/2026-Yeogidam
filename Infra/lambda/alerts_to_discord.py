"""CloudWatch 알람을 SNS로 받아 Discord 웹훅으로 보내는 Lambda다.

경로는 CloudWatch 알람 -> SNS 토픽 yeogidam-alerts -> 이 함수 -> Discord 웹훅이다.
표준 라이브러리만 쓰므로 배포 패키지 없이 콘솔 편집기에 붙여 넣으면 된다.

콘솔 등록 절차
1. Lambda > 함수 생성 > 새로 작성. 함수 이름 yeogidam-alerts-to-discord, 런타임 Python 3.13,
   실행 역할은 "기존 역할 사용"으로 techcourse-lambda-execution-role.
2. 코드 탭의 lambda_function.py 내용을 이 파일로 바꾸고 Deploy.
   핸들러는 기본값 lambda_function.lambda_handler 그대로 두면 된다(아래에 같은 이름을 열어 두었다).
3. 구성 > 환경 변수에 DISCORD_WEBHOOK_URL = Discord 채널 설정 > 연동 > 웹훅에서 만든 URL.
4. 구성 > 트리거 추가 > SNS, 토픽 yeogidam-alerts.
5. 태그 Service=techcourse, Role=techcourse-etc, ProjectTeam=yeogidam 세 개. 없으면 관리자가 지운다.
6. 확인은 SNS 콘솔에서 yeogidam-alerts 토픽에 아무 문장이나 게시한다. 본문이 그대로 Discord에
   오면 연결이 된 것이고, 알람이 실제로 울리면 색 있는 embed로 온다.

웹훅이 2xx가 아니면 예외를 던져 Lambda 오류로 남긴다. 재시도는 SNS가 한다.
"""

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

COLOR_ALARM = 0xE74C3C
COLOR_OK = 0x2ECC71
COLOR_OTHER = 0x95A5A6

# Discord가 받아 주는 길이 상한이다. 넘기면 400으로 거절해 알림이 아예 안 간다.
CONTENT_LIMIT = 2000
TITLE_LIMIT = 256
DESCRIPTION_LIMIT = 4096

KST = timezone(timedelta(hours=9))


def handler(event, context):
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL", "")
    if not webhook_url:
        raise RuntimeError("환경 변수 DISCORD_WEBHOOK_URL이 비어 있습니다.")

    for record in event.get("Records", []):
        message = record.get("Sns", {}).get("Message", "")
        send(webhook_url, build_payload(message))

    return {"sent": len(event.get("Records", []))}


# 콘솔 기본 핸들러 이름이다. 함수를 만들 때 런타임 설정을 안 고쳐도 되게 같은 함수를 연다.
lambda_handler = handler


def build_payload(message):
    """SNS 본문이 CloudWatch 알람 JSON이면 embed로, 아니면 본문 그대로 보낼 payload를 만든다."""
    try:
        body = json.loads(message)
    except (json.JSONDecodeError, TypeError):
        body = None

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
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def send(webhook_url, payload):
    request = urllib.request.Request(
        webhook_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "yeogidam-alerts-to-discord"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        # 4xx와 5xx는 urlopen이 예외로 올린다. 본문에 Discord가 거절한 이유가 있어 같이 남긴다.
        detail = error.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"Discord 웹훅이 {error.code}를 돌려주었습니다: {detail}") from error

    if not 200 <= status < 300:
        raise RuntimeError(f"Discord 웹훅이 {status}를 돌려주었습니다.")
